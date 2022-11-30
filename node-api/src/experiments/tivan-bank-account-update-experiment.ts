import * as PlanOut from 'planout';
import BaseExperiment from './base';
import { AnalyticsEvent } from '../typings';
import { EventData } from '../lib/amplitude';
import { get as configGet } from 'config';

const EXPERIMENT_NAME = 'tivan_ba_update_experiment';

export const TIVAN_BA_UPDATE_EVENT = 'TIVAN_BA_UPDATE_REPAYMENT';

export enum TivanBankAccountExperimentBucket {
  PlaidUpdater,
  BankAccountCloudTask,
}

export const TIVAN_BANK_ACCOUNT_BUCKET_FIELD = 'useBAUpdateCloudTask';

interface ITivanBAUpdateInputs extends PlanOut.Inputs {
  userId: number;
}

export default class TivanBankAccountUpdateExperiment extends BaseExperiment {
  private rolloutHundredthPercentage: number;

  public constructor(inputs: ITivanBAUpdateInputs) {
    super(inputs);
    this.rolloutHundredthPercentage = +configGet(
      'tivan.triggers.bankAccountUpdate.hundredthPercent',
    );
  }

  public serializeLog(data: PlanOut.Event): EventData {
    return {
      eventType: AnalyticsEvent.BucketedIntoTivanBAUpdateExperiment,
      userId: data.inputs.userId,
      eventProperties: {
        shouldUseCloudTask: data.params[TIVAN_BANK_ACCOUNT_BUCKET_FIELD],
      },
    };
  }

  public setup(): void {
    this.setName(EXPERIMENT_NAME);
  }

  public shouldUseCloudTask() {
    if (this.rolloutHundredthPercentage === 0) {
      return false; // PlanOut will throw an exception otherwise
    }

    return (
      this.get(TIVAN_BANK_ACCOUNT_BUCKET_FIELD) ===
      TivanBankAccountExperimentBucket.BankAccountCloudTask
    );
  }
  public assign(params: PlanOut.Assignment, inputs: ITivanBAUpdateInputs): void {
    params.set(
      TIVAN_BANK_ACCOUNT_BUCKET_FIELD,
      new PlanOut.Ops.Random.WeightedChoice({
        choices: [
          TivanBankAccountExperimentBucket.BankAccountCloudTask,
          TivanBankAccountExperimentBucket.PlaidUpdater,
        ],
        weights: [this.rolloutHundredthPercentage, 10000 - this.rolloutHundredthPercentage],
        unit: inputs.userId,
      }),
    );
  }
}
