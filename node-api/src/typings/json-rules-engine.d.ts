declare module 'json-rules-engine' {
  export type Event = {
    type: string;
    params: {
      message: string;
    };
  };
  export type Rule = {
    conditions: any;
    event: Event;
  };

  export type OperatorCb = (arg0: any, arg1: any) => boolean;

  export type Operator = {
    evaluate: OperatorCb;
  };

  export class Engine {
    public addFact(name: string, fact: any): void;
    public addOperator(name: string | Operator, cb?: OperatorCb): void;
    public addRule(rule: Rule): void;
    public run(): Promise<Event[]>;
  }
}
