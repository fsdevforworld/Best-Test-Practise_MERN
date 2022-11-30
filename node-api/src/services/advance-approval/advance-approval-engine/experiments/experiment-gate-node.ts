import * as PlanOut from 'planout';

import { AdvanceExperimentLog } from '../../../../models';

import { BooleanValue } from '../../../../typings';

import {
  AdvanceApprovalResult,
  ApprovalDict,
  DecisionNodeType,
  IDecisionCaseResponse,
} from '../../types';

import { EventData } from '../../../../lib/amplitude';
import { dogstatsd } from '../../../../lib/datadog-statsd';
import { getDecisionCaseError } from '../decision-node';
import { ILimiter } from '../decision-node/limiter';
import ExperimentDecisionNode from '../decision-node/experiment-decision-node';
import Counter from '../../../../lib/counter';
import BaseExperiment from '../../../../experiments/base';
import CounterLimiter from '../limiters/counter-limiter';
import { ExperimentId } from './index';

type SuccessfulFunction = ({
  approvalDict,
  result,
}: {
  approvalDict: ApprovalDict;
  result: AdvanceApprovalResult;
}) => Promise<boolean>;
type IncrementCounterOnAdvanceCreatedFunction = ({
  advanceId,
  experimentLog,
  isFirstAdvanceForExperiment,
}: {
  advanceId: number;
  experimentLog: AdvanceExperimentLog;
  isFirstAdvanceForExperiment: boolean;
}) => Promise<boolean>;

export type CounterConfig = {
  limit: number;
  incrementOnAdvanceCreated: IncrementCounterOnAdvanceCreatedFunction;
};

enum Metric {
  ExperimentalAdvanceCreated = 'experimental_advance_created',
}

export const EXPERIMENT_GATE_NAME_PREFIX = `experiment_gate_`;

export default class ExperimentGateNode extends ExperimentDecisionNode {
  public name: string;
  public active: boolean;
  public isSuccessful: SuccessfulFunction;
  public id: ExperimentId;
  public counter?: {
    incrementOnAdvanceCreated: IncrementCounterOnAdvanceCreatedFunction;
    increment: () => Promise<void>;
  };

  public description: string;

  public type = DecisionNodeType.Static;

  protected limiters: ILimiter[] = [];

  constructor({
    id,
    name,
    description,
    isSuccessful,
    customLimiter,
    counter,
    active = true,
    ratio = 1,
  }: {
    id: ExperimentId;
    name: string;
    description: string;
    isSuccessful: SuccessfulFunction;
    customLimiter?: (approvalDict: ApprovalDict) => Promise<boolean>;
    counter?: CounterConfig;
    active?: boolean;
    ratio?: number;
  }) {
    super();
    if (ratio > 1 || ratio < 0) {
      throw new Error('Ratio for experiment splitter must be between 0 and 1');
    }

    this.id = id;
    this.name = `${EXPERIMENT_GATE_NAME_PREFIX}${name}`;
    this.active = active;
    this.description = description;
    this.isSuccessful = isSuccessful;
    this.metadata = { active, counterLimit: counter?.limit, ratio };

    this.limiters = [
      {
        experimentIsAllowed: () => Promise.resolve(active),
      },
      {
        experimentIsAllowed: ({ userId }) =>
          Promise.resolve(
            new ExperimentPath(ratio, userId, `${this.id}_${this.name}`).isInExperimentGroup(),
          ),
      },
    ];

    if (counter) {
      const experimentCounter = new Counter(this.name);

      this.limiters.push(new CounterLimiter(counter.limit, () => experimentCounter.getValue()));
      this.counter = {
        incrementOnAdvanceCreated: params => counter.incrementOnAdvanceCreated(params),
        increment: () => experimentCounter.increment(),
      };
    }

    if (customLimiter) {
      this.limiters.push({ experimentIsAllowed: approvalDict => customLimiter(approvalDict) });
    }
  }

  /**
   * Handles incrementing the experiment counter based on the provided conditional function
   *
   * @param {Advance} advance
   * @param {AdvanceExperimentLog} experimentLog
   * @param {boolean} isFirstAdvanceForExperiment
   * @returns {Promise<void>}
   */
  public async onAdvanceCreated({
    advanceId,
    experimentLog,
    isFirstAdvanceForExperiment,
  }: {
    advanceId: number;
    experimentLog: AdvanceExperimentLog;
    isFirstAdvanceForExperiment: boolean;
  }) {
    let incrementCounter: boolean;

    if (this.counter) {
      incrementCounter = await this.counter.incrementOnAdvanceCreated({
        advanceId,
        experimentLog,
        isFirstAdvanceForExperiment,
      });

      if (incrementCounter) {
        await this.counter.increment();
      }
    }

    dogstatsd.increment(Metric.ExperimentalAdvanceCreated, {
      incremented_counter: incrementCounter ? '1' : '0',
      experiment_name: this.name,
      experiment_success: experimentLog.success ? '1' : '0',
    });
  }

  /**
   * Succeeds if all the limiters for this experiment pass
   *
   * @param {ApprovalDict} approvalDict
   * @param {boolean} isEligibleForExperiment
   * @param {AdvanceApprovalResult} approvalResponse
   * @returns {Promise<IDecisionCaseResponse<AdvanceApprovalResult>>>}
   */
  protected async experimentCase(
    approvalDict: ApprovalDict,
    isEligibleForExperiment: boolean,
    approvalResponse: AdvanceApprovalResult,
  ): Promise<IDecisionCaseResponse<AdvanceApprovalResult>> {
    if (!isEligibleForExperiment) {
      return {
        error: getDecisionCaseError('gateway-closed'),
        logData: { isEligibleForExperiment },
      };
    }
  }
}

export class ExperimentPath extends BaseExperiment {
  constructor(public ratio: number, userId: number, salt: string) {
    super({ userId });
    this.ratio = ratio;
    this.setSalt(salt);
  }

  public setup() {
    this.setName('path_splitter');
  }

  public serializeLog(data: PlanOut.Event): EventData {
    return {
      eventType: 'experiment_path_splitter',
      userId: data.inputs.userId,
    };
  }

  public isInExperimentGroup(): boolean {
    return this.get('is_in_experiment_group') === BooleanValue.True;
  }

  public assign(params: PlanOut.Assignment, { userId }: { userId: number }) {
    params.set(
      'is_in_experiment_group',
      new PlanOut.Ops.Random.WeightedChoice({
        choices: [BooleanValue.True, BooleanValue.False],
        weights: [this.ratio, 1 - this.ratio],
        unit: userId,
      }),
    );
  }
}
