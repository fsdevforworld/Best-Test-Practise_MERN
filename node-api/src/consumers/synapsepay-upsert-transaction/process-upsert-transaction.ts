import { isNil } from 'lodash';
import { TransactionJSON, TransactionWebhookData } from 'synapsepay';
import { Message } from '@google-cloud/pubsub';
import SynapsepayNodeLib from '../../domain/synapsepay/node';
import {
  Advance,
  FraudAlert,
  Payment,
  Reimbursement,
  SubscriptionPayment,
  User,
} from '../../models';
import AdvanceHelper from '../../helper/advance';

import * as PaymentDomain from '../../domain/payment';
import { PaymentUpdateTrigger } from '../../domain/payment';

import { ExternalTransactionStatus } from '@dave-inc/wire-typings';
import { dogstatsd } from '../../lib/datadog-statsd';
import * as createTask from '../../jobs/data';
import { FraudAlertReason, SynapsepayTransactionStatusId } from '../../typings';
import { FindOptions } from 'sequelize';
import logger from '../../lib/logger';
import { collectSubscriptionPayment } from '../../domain/event';

export async function processUpsertSynapsepayTransaction(
  event: Message,
  webhookData: TransactionWebhookData,
) {
  try {
    const synapseTransaction = webhookData._rest;

    const record = await findRecordForTransaction(synapseTransaction);
    const status = SynapsepayNodeLib.normalizeTransactionStatus(
      synapseTransaction.recent_status.status,
    );

    if (!record) {
      dogstatsd.increment('pubsub.synapsepay_transaction.not_found');
      logger.warn('Synapse webhook external ID not found', {
        webhookData,
      });
      event.nack();
      return;
    }

    dogstatsd.increment('pubsub.synapsepay.webhook.transaction_update', {
      status,
      type: record.constructor.name,
    });

    if (transactionIsUnauthorized(synapseTransaction)) {
      dogstatsd.increment(
        'pubsub.synapsepay.webhook.transaction_unauthorized',
        getUnauthorizedCodes(synapseTransaction).map(code => `code:${code}`),
      );
      await flagUnauthorizedTransaction(record);
    }

    if (record instanceof Advance) {
      await AdvanceHelper.updateDisbursementStatus(record, status);
    } else if (record instanceof Payment) {
      const previousStatus = record.status;
      await PaymentDomain.updatePayment(
        record,
        { status, webhookData },
        true,
        PaymentUpdateTrigger.SynapseUpsertTransaction,
      );
      dogstatsd.increment('pubsub.synapsepay.webhook.update_payment', 1, [
        `previous_status:${previousStatus}`,
        `status:${status}`,
      ]);
    } else if (record instanceof Reimbursement) {
      await record.updateStatus(status, webhookData);
    } else if (record instanceof SubscriptionPayment) {
      await record.updateStatus(status, webhookData);
      if (status === ExternalTransactionStatus.Canceled) {
        // for subscription payments we try to process ach first sometimes, on canceled lets retry debit
        const billing = await record.getSubscriptionBillings();
        const billingId = billing[0]?.id;
        if (isNil(billingId)) {
          logger.warn('No billing found for subscription payment record', {
            paymentId: record.id,
            externalId: record.externalId,
            processor: record.externalProcessor,
          });
        } else {
          await collectSubscriptionPayment.publish({
            subscriptionBillingId: billingId,
            forceDebitOnly: true,
          });
        }
      }
    }

    if (status === ExternalTransactionStatus.Canceled) {
      // Cancellations often happen because a user matches a sanctions list
      try {
        await createTask.refreshSanctionsScreening({ userId: record.userId });
      } catch (e) {
        dogstatsd.increment('refresh_sanctions_screening.enqueue_error', { message: e.message });
      }
    }

    event.ack();
  } catch (err) {
    logger.error('Error processing synapsepay transaction webhook event', {
      err,
    });
    dogstatsd.increment('pubsub.synapsepay_transaction.unexpected_error');
    event.nack();
  }
}

const UnauthorizedCodesRegex = /(R05|R07|R10|R29|R51)/g; // ['R05', 'R07', 'R10', 'R29', 'R51'];

function getUnauthorizedCodes(transaction: TransactionJSON): string[] | null {
  const {
    recent_status: { note },
  } = transaction;

  return note.match(UnauthorizedCodesRegex);
}

/**
 *
 * @see https://help.synapsefi.com/hc/en-us/articles/205737988-How-do-we-handle-chargebacks-|Chargeback
 * @see https://docs.synapsefi.com/docs/transaction-codes
 */
export function transactionIsUnauthorized(transaction: TransactionJSON) {
  const {
    recent_status: { status_id: statusId },
  } = transaction;

  if (statusId !== SynapsepayTransactionStatusId.Returned) {
    return false;
  }

  return getUnauthorizedCodes(transaction) !== null;
}

export async function findRecordForTransaction(
  transaction: TransactionJSON,
): Promise<Advance | SubscriptionPayment | Payment | Reimbursement | null> {
  const { _id: id } = transaction;

  const findFunctions: Array<(
    options: FindOptions,
  ) => Promise<Advance | SubscriptionPayment | Payment | null>> = [
    Advance.findOne.bind(Advance),
    Payment.findOne.bind(Payment),
    Reimbursement.findOne.bind(Reimbursement),
    SubscriptionPayment.findOne.bind(SubscriptionPayment),
  ];

  for (const findOne of findFunctions) {
    const record = await findOne({
      where: { externalId: id },
    });

    if (record) {
      return record;
    }
  }

  return null;
}

export async function flagUnauthorizedTransaction(
  unauthorizedRecord: Advance | Payment | SubscriptionPayment | Reimbursement,
) {
  const user = await User.findOne({
    where: {
      id: unauthorizedRecord.userId,
    },
    paranoid: false,
  });

  const extra = {
    unauthorizedRecord,
    //@ts-ignore This is valid according to http://docs.sequelizejs.com/manual/tutorial/upgrade-to-v4.html
    transactionType: unauthorizedRecord.constructor.getTableName(),
  };

  await FraudAlert.createFromUserAndReason(
    user,
    FraudAlertReason.UnauthorizedTransactionReported,
    extra,
  );
}
