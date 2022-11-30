declare module 'planout' {
  export abstract class Experiment {
    constructor(inputs: Inputs);

    public name: string;

    protected _exposureLogged: boolean;

    public abstract configureLogger(): void;

    public abstract log(event: Event): void;

    public abstract previouslyLogged(): void;

    public getDefaultParamNames(): string[];

    public abstract setup(): void;

    public abstract assign(params: Assignment, inputs: Inputs): void;

    public get(name: string): any;

    public setOverrides(values: { [key: string]: any }): void;

    public setName(name: string): void;

    public setSalt(name: string): void;
  }

  export class Assignment {
    public get(name: string): any;

    public set(name: string, value: any): void;
  }

  export namespace Ops.Random {
    class UniformChoice {
      constructor(params: { choices: Array<string | number>; unit: string | number });
    }

    class WeightedChoice {
      constructor(params: {
        choices: Array<string | number>;
        weights: number[];
        unit: string | number;
      });
    }

    class BernoulliTrial {
      constructor(params: { p: number; unit: string | number });
    }
  }

  export type Event = {
    event: string;
    name: string;
    time: number;
    inputs: Inputs;
    params: { [key: string]: any };
    extra_data: { [key: string]: any };
  };

  export type Inputs = {
    [key: string]: any;
  };
}
