import * as PlanOut from 'planout';
import * as config from 'config';
import BaseExperiment from './base';
import { EventData } from '../lib/amplitude';
import { AnalyticsEvent } from '../typings';
import { dogstatsd } from '../lib/datadog-statsd';

const REPAYMENTS_PERCENT_EXPERIMENT_CONFIG = 'tabapay.experiments.repaymentACH.percent';
const REPAYMENTS_EXPERIMENT_NAME = 'tabapay_repayments_ach';
const REPAYMENTS_USERID_OVERRIDES_CONFIG = 'tabapay.experiments.repaymentACH.overrides';

const DISBURSEMENTS_PERCENT_EXPERIMENT_CONFIG = 'tabapay.experiments.disbursementACH.percent';
const DISBURSEMENTS_EXPERIMENT_NAME = 'tabapay_disbursements_ach';
const DISBURSEMENTS_USERID_OVERRIDES_CONFIG = 'tabapay.experiments.disbursementACH.overrides';

const RepaymentBucketField = 'tabapay-ach-repayments';
const DisbursementsBucketField = 'tabapay-ach-disbursements';
enum RepaymentsChoice {
  Tabapay = 'use tabapay for ach repayments',
  NotTabapay = 'do not use tabapay for ach repayments',
}
enum DisbursementsChoice {
  Tabapay = 'use tabapay for ach disbursements',
  NotTabapay = 'do not use tabapay for ach disbursements',
}

interface ITabapayAchRepaymentsInput extends PlanOut.Inputs {
  userId: number;
}

class TabapayRepaymentsAchExperiment extends BaseExperiment {
  public overrides: Set<number>;
  private experimentPercent: number;
  private controlPercent: number;

  constructor(inputs: ITabapayAchRepaymentsInput) {
    super(inputs);

    this.overrides = config.has(REPAYMENTS_USERID_OVERRIDES_CONFIG)
      ? new Set(config.get<number[]>(REPAYMENTS_USERID_OVERRIDES_CONFIG))
      : new Set();

    if (config.has(REPAYMENTS_PERCENT_EXPERIMENT_CONFIG)) {
      this.experimentPercent = config.get<number>(REPAYMENTS_PERCENT_EXPERIMENT_CONFIG);
      this.controlPercent = 100 - this.experimentPercent;
    } else {
      this.experimentPercent = 0;
      this.controlPercent = 100;
    }
  }

  public setup() {
    this.setName(REPAYMENTS_EXPERIMENT_NAME);
  }

  public getBucket(): string {
    return this.get(RepaymentBucketField);
  }

  public assign(params: PlanOut.Assignment, inputs: ITabapayAchRepaymentsInput): void {
    params.set(
      RepaymentBucketField,
      new PlanOut.Ops.Random.WeightedChoice({
        choices: [RepaymentsChoice.Tabapay, RepaymentsChoice.NotTabapay],
        weights: [this.experimentPercent, this.controlPercent],
        unit: inputs.userId,
      }),
    );
  }

  public serializeLog(data: PlanOut.Event): EventData {
    return {
      eventType: AnalyticsEvent.TabapayACHRepayments,
      userId: data.inputs.userId,
      eventProperties: {
        source: data.params[RepaymentBucketField],
      },
    };
  }
}

class TabapayDisbursementsAchExperiment extends BaseExperiment {
  public overrides: Set<number>;
  private experimentPercent: number;
  private controlPercent: number;

  constructor(inputs: ITabapayAchRepaymentsInput) {
    super(inputs);

    this.overrides = config.has(DISBURSEMENTS_USERID_OVERRIDES_CONFIG)
      ? new Set(config.get<number[]>(DISBURSEMENTS_USERID_OVERRIDES_CONFIG))
      : new Set();

    if (config.has(DISBURSEMENTS_PERCENT_EXPERIMENT_CONFIG)) {
      this.experimentPercent = config.get<number>(DISBURSEMENTS_PERCENT_EXPERIMENT_CONFIG);
      this.controlPercent = 100 - this.experimentPercent;
    } else {
      this.experimentPercent = 0;
      this.controlPercent = 100;
    }
  }

  public setup() {
    this.setName(DISBURSEMENTS_EXPERIMENT_NAME);
  }

  public getBucket(): string {
    return this.get(DisbursementsBucketField);
  }

  public assign(params: PlanOut.Assignment, inputs: ITabapayAchRepaymentsInput): void {
    params.set(
      DisbursementsBucketField,
      new PlanOut.Ops.Random.WeightedChoice({
        choices: [DisbursementsChoice.Tabapay, DisbursementsChoice.NotTabapay],
        weights: [this.experimentPercent, this.controlPercent],
        unit: inputs.userId,
      }),
    );
  }

  public serializeLog(data: PlanOut.Event): EventData {
    return {
      eventType: AnalyticsEvent.TabapayACHDisbursements,
      userId: data.inputs.userId,
      eventProperties: {
        source: data.params[DisbursementsBucketField],
      },
    };
  }
}

export function useTabapayRepaymentsACH(userId: number) {
  const experiment = new TabapayRepaymentsAchExperiment({ userId });

  const inOverride = experiment.overrides.has(userId);
  const inExperiment = experiment.get(RepaymentBucketField) === RepaymentsChoice.Tabapay;

  const metricName = 'tabapay_ach_repayments_experiment';
  dogstatsd.increment(metricName, {
    override: inOverride.toString(),
    useTabapay: inExperiment.toString(),
  });

  return inOverride || inExperiment;
}

export function useTabapayDisbursementsACH(userId: number) {
  const experiment = new TabapayDisbursementsAchExperiment({ userId });

  const inOverride = experiment.overrides.has(userId);
  const inExperiment = experiment.get(DisbursementsBucketField) === DisbursementsChoice.Tabapay;

  const metricName = 'tabapay_ach_disbursements_experiment';
  dogstatsd.increment(metricName, {
    override: inOverride.toString(),
    useTabapay: inExperiment.toString(),
  });

  return inOverride || inExperiment;
}
