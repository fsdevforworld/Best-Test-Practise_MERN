import * as PlanOut from 'planout';
import BaseExperiment from './base';
import { AnalyticsEvent } from '../typings';
import { EventData } from '../lib/amplitude';
import { get as configGet } from 'config';

const EXPERIMENT_NAME = 'tivan_cloud_task_rollout_experiment';

export const TIVAN_AB_TESTING_EVENT = 'TIVAN_REPAYMENT';

export enum TivanCloudTaskExperimentBucket {
  Publisher,
  CloudTask,
}

export const TIVAN_CLOUD_TASK_BUCKET_FIELD = 'useCloudTask';

interface ITivanCloudTaskExperimentInputs extends PlanOut.Inputs {
  userId: number;
}

export default class TivanCloudTaskExperiment extends BaseExperiment {
  private rolloutHundredthPercentage: number;

  public constructor(inputs: ITivanCloudTaskExperimentInputs) {
    super(inputs);
    this.rolloutHundredthPercentage = +configGet('tivan.triggers.dailyCronjob.hundredthPercent');
  }

  public serializeLog(data: PlanOut.Event): EventData {
    return {
      eventType: AnalyticsEvent.BucketedIntoTivanCronJobExperiment,
      userId: data.inputs.userId,
      eventProperties: {
        shouldUseCloudTask: data.params[TIVAN_CLOUD_TASK_BUCKET_FIELD],
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

    return this.get(TIVAN_CLOUD_TASK_BUCKET_FIELD) === TivanCloudTaskExperimentBucket.CloudTask;
  }
  public assign(params: PlanOut.Assignment, inputs: ITivanCloudTaskExperimentInputs): void {
    params.set(
      TIVAN_CLOUD_TASK_BUCKET_FIELD,
      new PlanOut.Ops.Random.WeightedChoice({
        choices: [
          TivanCloudTaskExperimentBucket.CloudTask,
          TivanCloudTaskExperimentBucket.Publisher,
        ],
        weights: [this.rolloutHundredthPercentage, 10000 - this.rolloutHundredthPercentage],
        unit: inputs.userId,
      }),
    );
  }
}
