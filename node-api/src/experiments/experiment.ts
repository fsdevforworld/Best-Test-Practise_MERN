import BaseExperiment from './base';
import Counter from '../lib/counter';
import * as PlanOut from 'planout';
import { EventData } from '../lib/amplitude';
import { isNil } from 'lodash';
import { BooleanValue } from '../typings';
import { ABTestingEvent } from '../models';

export interface IExperiment<T extends ExperimentValue> {
  getResult(): Promise<T>;
  isBucketed(): Promise<boolean>;
  cleanup(): Promise<void>;
}

interface IExperimentLimiter {
  withinLimit(): Promise<boolean>;
  increment(): Promise<void>;
  cleanup(): Promise<void>;
}

type BaseExperimentOptions = {
  name: string;
  limit?: number;
  logSerializer?: LogSerializer;
};

type ExperimentOptions<T extends ExperimentValue> = {
  experimentValues: Array<ExperimentValueConfig<T>>;
  controlValue: T;
} & BaseExperimentOptions;

type BooleanExperimentOptions = {
  ratio: number;
} & BaseExperimentOptions;

type BinaryExperimentOptions<T extends ExperimentValue> = {
  controlValue: T;
} & BaseExperimentOptions &
  ExperimentValueConfig<T>;

type ExperimentValueConfig<T extends ExperimentValue> = {
  experimentValue: T;
  ratio: number;
};

type ExperimentValue = string | number;
type LogSerializer = (data: PlanOut.Event) => EventData;

export function buildExperiment<ResultType extends ExperimentValue>(
  userId: number,
  options: ExperimentOptions<ResultType>,
): IExperiment<ResultType> {
  return new Experiment(userId, options);
}

export function buildBinaryExperiment<ResultType extends ExperimentValue>(
  userId: number,
  { experimentValue, ratio, ...options }: BinaryExperimentOptions<ResultType>,
): IExperiment<ResultType> {
  const experimentOptions = {
    ...options,
    experimentValues: [
      {
        experimentValue,
        ratio,
      },
    ],
  };

  return buildExperiment<ResultType>(userId, experimentOptions);
}

export function buildBooleanExperiment(
  userId: number,
  options: BooleanExperimentOptions,
): IExperiment<BooleanValue> {
  return buildBinaryExperiment<BooleanValue>(userId, {
    ...options,
    experimentValue: BooleanValue.True,
    controlValue: BooleanValue.False,
  });
}

function buildLimiter(name: string, limit?: number): IExperimentLimiter {
  if (isNil(limit)) {
    return {
      async withinLimit(): Promise<boolean> {
        return true;
      },
      async increment(): Promise<void> {},
      async cleanup(): Promise<void> {},
    };
  } else {
    const counter = new Counter(`${name}_experiment_limiter`);
    return {
      async withinLimit(): Promise<boolean> {
        const currentCount = await counter.getValue();
        return currentCount < limit;
      },

      async increment(): Promise<void> {
        await counter.increment();
      },

      async cleanup() {
        await counter.destroy();
      },
    };
  }
}

class Experiment<ResultType extends ExperimentValue> extends BaseExperiment {
  private controlValue: ResultType;
  private experimentValues: ResultType[];
  private ratios: number[];
  private logSerializer: LogSerializer;
  private limiter: IExperimentLimiter;
  private userId: number;

  private result: ResultType;

  public constructor(
    userId: number,
    { name, controlValue, experimentValues, limit, logSerializer }: ExperimentOptions<ResultType>,
  ) {
    super({ userId });

    this.setName(name);
    this.limiter = buildLimiter(name, limit);
    this.controlValue = controlValue;
    this.ratios = experimentValues.map(v => v.ratio);
    this.experimentValues = experimentValues.map(v => v.experimentValue);
    this.logSerializer = logSerializer;
    this.userId = userId;

    if (this.ratioSum() > 1) {
      throw new Error('experiment ratios cannot add up to more than 1');
    }
  }

  public setup() {
    // This is to get around the fact that setup is called in the constructor for PlanOut.Experiment, and expects the name to be set at that point.
    // It will be overridden based on the options in the constructor
    this.setName('experiment');
  }

  public async getResult(): Promise<ResultType> {
    if (!this.result) {
      if (await this.limiter.withinLimit()) {
        const experimentResult = this.get(this.name);

        if (experimentResult !== this.controlValue) {
          await Promise.all([this.storeResult(experimentResult), this.limiter.increment()]);
        }

        this.result = experimentResult;
      } else {
        this.result = this.controlValue;
      }
    }

    return this.result;
  }

  public async isBucketed(): Promise<boolean> {
    const result = await this.getResult();
    return result !== this.controlValue;
  }

  public serializeLog(data: PlanOut.Event): EventData {
    const serializer = this.logSerializer || this.defaultLogSerializer;

    return serializer(data);
  }

  public assign(params: PlanOut.Assignment, { userId }: { userId: number }): boolean {
    params.set(
      this.name,
      new PlanOut.Ops.Random.WeightedChoice({
        choices: [...this.experimentValues, this.controlValue],
        weights: [...this.ratios, 1 - this.ratioSum()],
        unit: userId,
      }),
    );

    // The return value indicates to PlanOut whether or not the result should be logged. We only want to log for experiment values
    return params.get(this.name) !== this.controlValue;
  }

  public async cleanup() {
    await this.limiter.cleanup();
  }

  public getParamNames() {
    return [this.name];
  }

  private async storeResult(result: ResultType) {
    await ABTestingEvent.create({
      userId: this.userId,
      eventName: this.name,
      extra: {
        result,
      },
    });
  }

  private ratioSum(): number {
    return this.ratios.reduce((sum, val) => sum + val);
  }

  private defaultLogSerializer(data: PlanOut.Event): EventData {
    return {
      eventType: data.name,
      userId: data.inputs.userId,
      eventProperties: {
        source: data.params[data.name],
      },
    };
  }
}
