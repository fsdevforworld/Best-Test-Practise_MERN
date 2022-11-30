import * as PlanOut from 'planout';

import { EventData } from '../lib/amplitude';

import { AnalyticsEvent } from '../typings';

import BaseExperiment from './base';

const PERCENT_OF_USERS_TO_BUCKET_TO_CONTROL_GROUP = 95;
const PERCENT_OF_USERS_TO_BUCKET_TO_AVS = 5;
const EXPERIMENT_NAME = 'tabapay_avs_experiment';
const TABAPAY_AVS_BUCKET_FIELD = 'should_use_avs';

enum AVSBucket {
  DoNotUseAVS = 'do not use avs',
  UseAVS = 'use avs',
}

interface ITabapayAVSExperimentInputs extends PlanOut.Inputs {
  userId: number;
}

export default class TabapayAVSExperiment extends BaseExperiment {
  constructor(inputs: ITabapayAVSExperimentInputs) {
    super(inputs);
  }

  public setup(): void {
    this.setName(EXPERIMENT_NAME);
  }
  public serializeLog(data: PlanOut.Event): EventData {
    return {
      eventType: AnalyticsEvent.BucketedIntoTabapayAVSExperiment,
      userId: data.inputs.userId,
      eventProperties: {
        source: data.params[TABAPAY_AVS_BUCKET_FIELD],
      },
    };
  }

  public get shouldUseAvs() {
    return this.get(TABAPAY_AVS_BUCKET_FIELD) === AVSBucket.UseAVS;
  }

  public assign(params: PlanOut.Assignment, inputs: ITabapayAVSExperimentInputs): void {
    params.set(
      TABAPAY_AVS_BUCKET_FIELD,
      new PlanOut.Ops.Random.WeightedChoice({
        choices: [AVSBucket.DoNotUseAVS, AVSBucket.UseAVS],
        weights: [PERCENT_OF_USERS_TO_BUCKET_TO_CONTROL_GROUP, PERCENT_OF_USERS_TO_BUCKET_TO_AVS],
        unit: inputs.userId,
      }),
    );
  }
}
