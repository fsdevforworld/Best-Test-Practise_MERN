import { Moment } from 'moment';

declare global {
  namespace Chai {
    export interface Assertion {
      sameMoment(expected: string | Moment, granularity?: string): this;
    }
  }
}
