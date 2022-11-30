import { Op } from 'sequelize';
import { Moment } from 'moment';
import { PaymentProviderTransactionType } from '@dave-inc/loomis-client';

import { Advance, AdvanceCollectionAttempt, Payment } from '../../models';
import {
  AdvanceCollectionTrigger,
  ChargeableMethod,
  ExternalPayment,
  ExternalPaymentCreator,
  AnalyticsEvent,
} from '../../typings';
import { attemptChargeAndRecordProcessorError } from './payment-processor';
import { dogstatsd } from '../../lib/datadog-statsd';
import { ConflictError, PaymentError } from '../../lib/error';
import logger from '../../lib/logger';
import Braze from '../../lib/braze';
import { moment } from '@dave-inc/time-lib';
import validateCollection from '../advance-collection-engine';
import { generateRandomHexString } from '../../lib/utils';
import { ExternalTransactionStatus } from '@dave-inc/wire-typings';
import * as Jobs from '../../jobs/data';
import { updateOutstanding, validatePredictedOutstanding } from './outstanding';
import ErrorHelper from '@dave-inc/error-helper';
import { isActiveCollection } from '../active-collection';
import { publishPaymentCreationEvent } from '../payment';
import { publishPaymentUpdateEvent } from '../payment/loomis-migration';

export const MAX_COLLECTION_ATTEMPTS = 4;

const ADVANCE_COLLECTION_METRIC = 'advance_collection';

export async function collectAdvance(
  advance: Advance,
  amount: number,
  createExternalPayment: ExternalPaymentCreator,
  trigger?: AdvanceCollectionTrigger,
  time?: Moment,
): Promise<AdvanceCollectionAttempt> {
  await clearStaleCollectionAttempts(advance);

  const collectionAttempt = await createCollectionAttempt(advance, amount, trigger);

  let payment: Payment | null = null;
  try {
    await advance.reload();

    await validateCollectionAttempt(advance, amount, trigger);

    payment = await initializePayment(advance, amount);

    const externalPayment = await attemptChargeAndRecordProcessorError(
      createExternalPayment,
      amount,
      payment,
      'advance_collection',
      time,
    );

    await recordExternalPayment(advance, externalPayment, payment);
    await collectionAttempt.setPayment(payment);

    await instrumentPayment(payment);
  } catch (ex) {
    collectionAttempt.set('extra', { ...collectionAttempt.extra, err: ex });
    await collectionAttempt.save();
    await triggerBrazeMissedPaybackEvent(advance);
  } finally {
    await collectionAttempt.update({ processing: null });

    try {
      await publishPaymentCreationEvent(PaymentProviderTransactionType.AdvancePayment, payment);
    } catch (error) {
      logger.warn('Failed to publish payment event', { error, payment });
    }
  }

  return collectionAttempt;
}

export async function clearStaleCollectionAttempts(
  advance: Advance,
  attemptedBefore: Moment = moment().subtract(30, 'minutes'),
) {
  await AdvanceCollectionAttempt.update(
    { processing: null },
    {
      where: {
        advanceId: advance.id,
        processing: true,
        created: {
          [Op.lte]: attemptedBefore,
        },
      },
    },
  );
}

export async function createCollectionAttempt(
  advance: Advance,
  amount: number,
  trigger: AdvanceCollectionTrigger,
) {
  try {
    const collectionAttempt = await AdvanceCollectionAttempt.create({
      advanceId: advance.id,
      amount,
      trigger,
    });

    dogstatsd.increment(`${ADVANCE_COLLECTION_METRIC}.collection_attempt_created`);
    return collectionAttempt;
  } catch (ex) {
    dogstatsd.increment(`${ADVANCE_COLLECTION_METRIC}.collection_already_in_progress`);
    throw new ConflictError('Collection already in progress');
  }
}

async function validateCollectionAttempt(
  advance: Advance,
  amount: number,
  trigger: AdvanceCollectionTrigger,
) {
  const numSuccessfulCollectionAttempts = await AdvanceCollectionAttempt.scope('successful').count({
    where: { advanceId: advance.id },
  });

  const isActive = await isActiveCollection(`${advance.userId}`, `${advance.id}`);

  const failedValidations = await validateCollection(
    advance,
    amount,
    numSuccessfulCollectionAttempts,
    trigger,
    isActive,
  );

  if (failedValidations.length > 0) {
    dogstatsd.increment(`${ADVANCE_COLLECTION_METRIC}.collection_attempt_validation_failed`, {
      type: failedValidations
        .map(val => val.type)
        .sort()
        .join(','),
    });
    throw new PaymentError('Failed collection validations', {
      data: failedValidations,
    });
  }

  await validatePredictedOutstanding(advance, amount);
}

async function initializePayment(advance: Advance, amount: number) {
  const referenceId = generateRandomHexString(15);
  const payment = await Payment.create({
    advanceId: advance.id,
    userId: advance.userId,
    amount,
    referenceId,
    status: ExternalTransactionStatus.Pending,
  });

  return payment;
}

async function recordExternalPayment(
  advance: Advance,
  externalPayment: ExternalPayment,
  payment: Payment,
): Promise<void> {
  await updateOutstanding(advance);

  if (externalPayment == null) {
    dogstatsd.increment(`${ADVANCE_COLLECTION_METRIC}.record_external_payment.unknown_error`);
    return;
  }

  const { id: externalId, status, processor, chargeable, type } = externalPayment;

  let bankAccountId;
  let paymentMethodId;

  if (chargeable && chargeable.id) {
    switch (type) {
      case ChargeableMethod.Ach:
        bankAccountId = chargeable.id;
        break;
      case ChargeableMethod.DebitCard:
        paymentMethodId = chargeable.id;
        break;
      default:
        logger.warn('Unexpected advance payment charge method', { type });
    }
  }

  const updates = {
    externalId,
    status,
    externalProcessor: processor,
    bankAccountId,
    paymentMethodId,
  };
  await payment.update(updates);
  await publishPaymentUpdateEvent({ legacyId: payment.id, ...updates });

  dogstatsd.increment(`${ADVANCE_COLLECTION_METRIC}.payment_created`, 1, [
    `processor:${processor}`,
  ]);
}

async function instrumentPayment(payment: Payment): Promise<void> {
  try {
    await Jobs.broadcastAdvancePaymentTask({ paymentId: payment.id });
  } catch (error) {
    logger.error('Error broadcasting advance payment', { error: ErrorHelper.logFormat(error) });
  }
}

async function triggerBrazeMissedPaybackEvent({ userId, paybackDate }: Advance): Promise<void> {
  const now = moment();

  try {
    // payback date hasn't reached yet
    if (paybackDate && paybackDate.isAfter(now, 'day')) {
      return;
    }

    await Braze.track({
      events: [
        {
          name: AnalyticsEvent.MissedPayback,
          externalId: `${userId}`,
          time: now,
        },
      ],
    });
  } catch (error) {
    logger.error(`Error sending event to braze: ${AnalyticsEvent.MissedPayback}`, {
      error: ErrorHelper.logFormat(error),
    });
  }
}
