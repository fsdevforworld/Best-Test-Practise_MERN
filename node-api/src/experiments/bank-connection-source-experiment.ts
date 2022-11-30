import { BankingDataSource } from '@dave-inc/wire-typings';
import * as PlanOut from 'planout';

import { EventData } from '../lib/amplitude';

import { AnalyticsEvent } from '../typings';

import BaseExperiment from './base';

const PERCENT_OF_USERS_TO_BUCKET_TO_PLAID = 80;
const PERCENT_OF_USERS_TO_BUCKET_TO_MX = 20;
const EXPERIMENT_NAME = 'mx_experiment';
const BANK_CONNECTION_SOURCE_BUCKET_FIELD = 'source';

export type BankConnectionSourceExperimentBucket = BankingDataSource.Plaid | BankingDataSource.Mx;

interface IBankConnectionSourceExperimentInputs extends PlanOut.Inputs {
  userId: number;
}

export default class BankConnectionSourceExperiment extends BaseExperiment {
  public constructor(inputs: IBankConnectionSourceExperimentInputs) {
    super(inputs);
  }

  public setup(): void {
    this.setName(EXPERIMENT_NAME);
  }

  public serializeLog(data: PlanOut.Event): EventData {
    return {
      eventType: AnalyticsEvent.BucketedIntoBankConnectionSourceExperiment,
      userId: data.inputs.userId,
      eventProperties: {
        source: data.params[BANK_CONNECTION_SOURCE_BUCKET_FIELD],
      },
    };
  }

  public getBucket(): BankConnectionSourceExperimentBucket {
    return this.get(BANK_CONNECTION_SOURCE_BUCKET_FIELD);
  }

  public assign(params: PlanOut.Assignment, inputs: IBankConnectionSourceExperimentInputs): void {
    params.set(
      BANK_CONNECTION_SOURCE_BUCKET_FIELD,
      new PlanOut.Ops.Random.WeightedChoice({
        choices: [BankingDataSource.Plaid, BankingDataSource.Mx],
        weights: [PERCENT_OF_USERS_TO_BUCKET_TO_PLAID, PERCENT_OF_USERS_TO_BUCKET_TO_MX],
        unit: inputs.userId,
      }),
    );
  }
}
