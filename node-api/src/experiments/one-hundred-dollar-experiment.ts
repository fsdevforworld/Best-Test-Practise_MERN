import * as PlanOut from 'planout';
import { EventData } from '../lib/amplitude';
import BaseExperiment from './base';

export const BASE_EXPERIMENT_NAME = 'one_hundred_dollar_experiment';

type OneHundredDollarExperimentInputs = {
  userId: number;
};

const ADVANCE_AMOUNT_FIELD = 'advanceAmount';

export default class OneHundredDollarExperiment extends BaseExperiment {
  constructor(inputs: OneHundredDollarExperimentInputs) {
    super(inputs);
  }

  public setup() {
    this.setName(BASE_EXPERIMENT_NAME);
  }

  public serializeLog(data: PlanOut.Event): EventData {
    return {
      eventType: 'dave_advance_experiment_group_picked',
      userId: data.inputs.userId,
      eventProperties: {
        advanceAmount: data.params[ADVANCE_AMOUNT_FIELD],
      },
    };
  }

  public advanceAmount() {
    return this.get(ADVANCE_AMOUNT_FIELD);
  }

  public assign(params: PlanOut.Assignment, inputs: OneHundredDollarExperimentInputs) {
    params.set(
      ADVANCE_AMOUNT_FIELD,
      new PlanOut.Ops.Random.WeightedChoice({
        choices: [75, 100],
        weights: [50, 50],
        unit: inputs.userId,
      }),
    );
  }
}
