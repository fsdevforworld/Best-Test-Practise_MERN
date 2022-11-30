import * as config from 'config';
import { constant, isNil } from 'lodash';
import { buildExperiment, Experiment } from '@dave-inc/experiment';
import { ABTestingEvent, Advance, InternalUser } from '../../models';
import { AdvanceCollectionTrigger } from '../../typings';
import { TIVAN_BA_UPDATE_EVENT } from '../../experiments/tivan-bank-account-update-experiment';
import { TIVAN_AB_TESTING_EVENT } from '../../experiments/tivan-cloud-task-experiment';
import logger from '../../lib/logger';

const TivanUserPaymentsExperiment = 'tivan-user-payments';

const InternalUserPaymentEnabled = config.get<boolean>(
  'tivan.triggers.userPayment.internalUsersEnabled',
);
const UserPaymentPct = config.get<number>('tivan.triggers.userPayment.tivanPercentage');

const TriggerExperimentEvents: Record<string, string> = {
  [AdvanceCollectionTrigger.BANK_ACCOUNT_UPDATE]: TIVAN_BA_UPDATE_EVENT,
  [AdvanceCollectionTrigger.DAILY_CRONJOB]: TIVAN_AB_TESTING_EVENT,
};

export async function shouldRepayWithTivan(
  advanceId: number,
  trigger: AdvanceCollectionTrigger,
): Promise<boolean> {
  const eventName = TriggerExperimentEvents[trigger];
  if (isNil(eventName)) {
    return false;
  } else {
    return isBucketed(advanceId, eventName);
  }
}

async function isBucketed(advanceId: number, eventName: string): Promise<boolean> {
  const event = await ABTestingEvent.findOne({
    where: {
      eventName,
      eventUuid: advanceId,
    },
  });
  return !isNil(event);
}

export const TIVAN_AD_HOC_BA_UPDATE = 'TIVAN_AD_HOC_BA_UPDATE_REPAYMENT';

export async function adHocBucketTivan(
  advanceId: number,
  userId: number,
  experiment: Experiment<boolean>,
  eventName: string,
): Promise<boolean> {
  if (await experiment(advanceId)) {
    await ABTestingEvent.create({
      userId,
      eventUuid: advanceId,
      eventName,
    });
    return true;
  } else {
    return false;
  }
}

export async function shouldCollectWithTivan(
  advance: Advance,
  trigger: AdvanceCollectionTrigger,
  experiment: Experiment<boolean>,
  eventName: string,
): Promise<boolean> {
  return (
    (await shouldRepayWithTivan(advance.id, trigger)) || // intentional necessary short circuit
    (await adHocBucketTivan(advance.id, advance.userId, experiment, eventName))
  );
}

export function createTivanExperiment(eventName: string): Experiment<boolean> {
  const pctHundredth = config.get<number>(`tivan.triggers.${eventName}.hundredthPercent`);
  const pct = pctHundredth / 10000;
  logger.info(`Initialize ${eventName} repayment percentage ${pct}`);

  return buildExperiment<boolean>(eventName, {
    control: constant(false),
    experiment: constant(true),
    config: { ratio: pct },
  });
}

export const AdHocBankAccountUpdate: Experiment<boolean> = (() => {
  const pctHundredth = config.get<number>('tivan.triggers.bankAccountUpdate.adHocHundredthPercent');
  const pct = pctHundredth / 10000;
  logger.info(`Initialize ad-hoc Tivank bank account update repayment percentage ${pct}`);

  return buildExperiment<boolean>('ad-hoc-tivan-bank-account-update', {
    control: constant(false),
    experiment: constant(true),
    config: { ratio: pct },
  });
})();

async function isInternalUser(userId: number): Promise<boolean> {
  const user = await InternalUser.findByPk(userId);
  return !isNil(user);
}

export async function shouldProcessUserPaymentWithTivan(
  advanceId: number,
  userId: number,
  percentage: number = UserPaymentPct,
): Promise<boolean> {
  // experiment override: internal users are automatically
  // in experiment
  if (InternalUserPaymentEnabled && (await isInternalUser(userId))) {
    logger.info('processing internal user payment with Tivan', { advanceId, userId });
    return true;
  }

  const experiment = buildExperiment<boolean>(TivanUserPaymentsExperiment, {
    config: { ratio: percentage },
    experiment: async () => {
      const tivanPayment = {
        userId,
        eventUuid: advanceId,
        eventName: TivanUserPaymentsExperiment,
      };
      const existing = await ABTestingEvent.findOne({ where: tivanPayment });
      if (existing) {
        logger.warn('user-payment advance already bucketed to Tivan', { advanceId });
      } else {
        await ABTestingEvent.create(tivanPayment);
        logger.info('user-payment advance bucketed to Tivan', { advanceId });
      }
      return true;
    },
    control: constant(false),
  });

  return experiment(advanceId);
}
