import * as PlanOut from 'planout';
import amplitude, { EventData } from '../lib/amplitude';
import BaseExperiment from './base';
import { BooleanValue } from '../typings';
import { AnalyticsUserProperty } from '../typings';
import * as config from 'config';

const EXPERIMENT = 'shouldAutoAddExpenses';
const choices = [BooleanValue.True, BooleanValue.False];

type ExperimentInputs = { userId: number };
export default class Experiment extends BaseExperiment {
  constructor(inputs: ExperimentInputs) {
    super(inputs);
  }

  public setup() {
    this.setName(EXPERIMENT);
  }

  // TODO when base class is fixed, remove serializeLog and getParamNames
  public serializeLog(data: PlanOut.Event): EventData {
    return { eventType: null };
  }
  public getParamNames() {
    return [EXPERIMENT];
  }

  public get shouldAutoAddExpenses() {
    return this.get(EXPERIMENT) === BooleanValue.True;
  }

  public async log(data: PlanOut.Event) {
    const value = data.params[EXPERIMENT];
    amplitude.identify({
      user_id: data.inputs.userId,
      user_properties: {
        $postInsert: {
          [AnalyticsUserProperty.ABTests]: `${EXPERIMENT}:${value}`,
        },
      },
    });
  }

  public assign(params: PlanOut.Assignment, inputs: ExperimentInputs): void {
    const unit = inputs.userId;
    const weights = getExperimentWeights();
    const assignment = new PlanOut.Ops.Random.WeightedChoice({ choices, weights, unit });
    params.set(EXPERIMENT, assignment);
  }
}

export function isBucketed(userId: number) {
  const experiment = new Experiment({ userId });
  return experiment.shouldAutoAddExpenses;
}

function getExperimentWeights(): number[] {
  const experimentLimit = config.get<number>(
    'recurringTransaction.autoDetectExpensesExperimentLimit',
  );
  return [Number(experimentLimit), 100 - Number(experimentLimit)];
}
