import loomisClient, { PaymentMethod as LoomisPaymentMethod } from '@dave-inc/loomis-client';
import * as Bluebird from 'bluebird';
import * as config from 'config';
import { identity, isEmpty, isNil, sum } from 'lodash';
import { Op } from 'sequelize';
import * as Jobs from '../jobs/data';

import { createAdvanceRefund, processAdvanceRefund } from '../domain/advance-refund';
import { reversePayment } from '../domain/payment';
import { wrapMetrics } from '../lib/datadog-statsd';
import logger from '../lib/logger';
import { Advance, BankAccount, Payment, Reimbursement, User } from '../models';
import { Cron, DaveCron } from './cron';

const enum Metrics {
  Attempt = 'batch-refund.attempt',
  Success = 'batch-refund.refunded',
  RefundError = 'batch-refund.error',
  AlreadyRefunded = 'batch-refund.already-refunded',
  AmountAttempted = 'batch-refund.amount.attempted',
  AmountRefunded = 'batch-refund.amount.refunded',
  LessThanOneDollarRefund = 'less-than-one-dollar-refund',
}

const SUCCESS_STATUSES = ['COMPLETED', 'PENDING'];

const metrics = wrapMetrics<Metrics>();

const DAVE_BUCKET = config.get<string>('googleCloud.projectId');

const refundReason = 'wrongfully charged';

type RefundRecord = {
  userId: number;
  advanceId: number;
  amount: number;
  advance: Advance;
};

async function getRecords(): Promise<RefundRecord[]> {
  const advances = await Advance.findAll({
    where: {
      outstanding: {
        [Op.lt]: 0,
      },
    },
    include: [Reimbursement, User, Payment, BankAccount],
  });
  return advances.map(a => ({
    userId: a.userId,
    advanceId: a.id,
    amount: -a.outstanding,
    advance: a,
  }));
}

function recordAttempt(refund: RefundRecord): RefundRecord {
  metrics.increment(Metrics.Attempt);
  metrics.increment(Metrics.AmountAttempted, refund.amount);
  return refund;
}

async function getLoomisPaymentMethod(paymentMethodId: number): Promise<LoomisPaymentMethod> {
  try {
    const response = await loomisClient.getPaymentMethod({
      id: paymentMethodId,
      includeSoftDeleted: true,
    });
    if (isNil(response)) {
      logger.error('No Loomis response', {
        paymentMethodId,
      });
    } else if ('data' in response) {
      return response.data;
    } else {
      logger.error('Failed to get Loomis payment for payment method', {
        paymentMethodId,
      });
    }
  } catch (error) {
    logger.error('Loomis request error', { error, paymentMethodId });
    metrics.increment(Metrics.RefundError, { error: 'loomis-request' });
  }
}

async function greaterThanOneDollar(refund: RefundRecord) {
  if (refund.amount <= 1) {
    logger.error('Refund error: refund is less than a dollar', { refund });
    metrics.increment(Metrics.RefundError, { error: 'refund-too-small' });
    metrics.increment(Metrics.LessThanOneDollarRefund, refund.amount);
    return false;
  }
  return true;
}

async function notAlreadyRefunded(refund: RefundRecord): Promise<boolean> {
  const { advance } = refund;
  if (!isNil(advance) && !isEmpty(advance.reimbursements)) {
    const amounts = advance.reimbursements
      .filter(reim => SUCCESS_STATUSES.includes(reim.status))
      .map(reim => reim.amount);
    const reimbursed = sum(amounts);
    if (reimbursed > 0) {
      logger.warn('skipping reimbursement, advance already has refund', {
        refund,
        reimbursements: {
          totalAmount: reimbursed,
          reimbursements: advance.reimbursements.map(reim => reim.id),
        },
      });
      metrics.increment(Metrics.AlreadyRefunded);
      // Just set the outstanding to 0
      await refund.advance.update({ outstanding: 0 });
      return false;
    } else {
      const unknownReimbursement = advance.reimbursements.find(reim => reim.status === 'UNKNOWN');
      if (!isNil(unknownReimbursement)) {
        logger.warn('skipping reimbursement, advance has reimbursement in UNKNOWN status', {
          refund,
          unknownReimbursement: unknownReimbursement.toJSON(),
        });
      }
    }
  }
  return true;
}

async function broadcastRefunded(refund: RefundRecord): Promise<void> {
  await Jobs.updateBrazeTask({
    userId: refund.userId,
    eventProperties: {
      name: 'advance_overcharge_refund',
      properties: {
        amount: refund.amount,
      },
    },
  });
}

async function reverseAdvancePayment(
  refund: RefundRecord,
): Promise<{ success: boolean; error?: any }> {
  const paymentToReverse = refund.advance.payments.find(p => p.amount === refund.amount);
  try {
    if (paymentToReverse) {
      const { paymentReversal } = await reversePayment(paymentToReverse, {
        note: refundReason,
      });

      if (SUCCESS_STATUSES.includes(paymentReversal.status)) {
        metrics.increment(Metrics.Success);
        metrics.increment(Metrics.AmountRefunded, refund.amount);
        await broadcastRefunded(refund);
        return { success: true };
      } else {
        metrics.increment(Metrics.RefundError, { error: 'reversal-incomplete' });
        return { success: false };
      }
    }

    return { success: false };
  } catch (error) {
    metrics.increment(Metrics.RefundError, { error: 'reversal-error' });
    logger.error('Reversal error: failed to reverse payment', {
      refund,
      paymentToReverse,
      error,
    });
    return { success: false, error };
  }
}

async function reimburseToDestination(
  refund: RefundRecord,
  destination: LoomisPaymentMethod | BankAccount,
): Promise<{ success: boolean; error?: any }> {
  try {
    const advance = refund.advance;
    const { reimbursement } = await createAdvanceRefund({
      userId: advance.user.id,
      destination,
      advance,
      lineItems: [
        {
          reason: 'overpayment',
          amount: refund.amount,
        },
      ],
    });
    await processAdvanceRefund(reimbursement, advance);
    if (!SUCCESS_STATUSES.includes(reimbursement.status)) {
      logger.error('Refund error: refund issued but incomplete', {
        refund,
        reimbursement,
      });
      metrics.increment(Metrics.RefundError, { error: 'reimbursement-incomplete' });
      return { success: false };
    } else {
      logger.info('Successfully refunded user', {
        refund,
        reimbursement,
      });
      metrics.increment(Metrics.Success);
      metrics.increment(Metrics.AmountRefunded, refund.amount);
      await broadcastRefunded(refund);

      return { success: true };
    }
  } catch (error) {
    logger.error('Refund error: error issuing refund', {
      refund,
      error,
    });
    metrics.increment(Metrics.RefundError, { error: 'reimbursement-error' });
    return { success: false, error };
  }
}

async function refundAdvance(refund: RefundRecord): Promise<RefundRecord> {
  const result = await reverseAdvancePayment(refund);
  if (result.success) {
    return refund;
  }

  const reimburseDestinations: Array<LoomisPaymentMethod | BankAccount> = [];

  const advancePaymentMethod = await getLoomisPaymentMethod(refund.advance.paymentMethodId);
  if (advancePaymentMethod) {
    reimburseDestinations.push(advancePaymentMethod);
  }
  if (refund.advance.bankAccount) {
    reimburseDestinations.push(refund.advance.bankAccount);
  }
  const userDefaultBankAccountId = refund.advance.user?.defaultBankAccountId;
  if (userDefaultBankAccountId && userDefaultBankAccountId !== refund.advance.bankAccountId) {
    const bankAccount = await BankAccount.findByPk(userDefaultBankAccountId);
    if (bankAccount && bankAccount.defaultPaymentMethodId) {
      const defualtPaymentMethod = await getLoomisPaymentMethod(bankAccount.defaultPaymentMethodId);
      if (defualtPaymentMethod) {
        reimburseDestinations.push(defualtPaymentMethod);
      }
    }
    if (bankAccount) {
      reimburseDestinations.push(bankAccount);
    }
  }

  for (const destination of reimburseDestinations) {
    const reimbursementResult = await reimburseToDestination(refund, destination);
    if (reimbursementResult.success) {
      return refund;
    }
  }
}

export async function refundAdvanceCharges(refunds: RefundRecord[]) {
  return await Bluebird.resolve(refunds)
    .mapSeries(recordAttempt)
    .filter(greaterThanOneDollar)
    .filter(notAlreadyRefunded)
    .mapSeries(refund => refundAdvance(refund))
    .filter(identity);
}

export async function run() {
  try {
    const records = await getRecords();
    const refunds = await refundAdvanceCharges(records);

    logger.info('Finished refunded advance job', {
      attempted: records.length,
      succeeded: refunds.length,
      refundRecordsFile: `gcs://${DAVE_BUCKET}/$fileName`,
    });
  } catch (error) {
    logger.error('Failed to refund advance for users', {
      error,
      bucket: DAVE_BUCKET,
    });
  }
}

export const RefundOverchargedAdvances: Cron = {
  name: DaveCron.RefundOverchargedAdvances,
  process: run,
  schedule: '0 0 * * *',
};
