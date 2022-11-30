import * as sinon from 'sinon';
import * as Limiter from '../../src/lib/experiment-limiter';
import { ILimiter } from '@dave-inc/experiment';

export function stubExperimentLimiter(
  sandbox: sinon.SinonSandbox,
): { stub: sinon.SinonStub; limiter: ILimiter } {
  let value = 0;
  let upperLimit: number;

  const limiter = {
    increment: async () => {
      value++;
    },
    withinLimit: async () => {
      return value < upperLimit;
    },
  };
  const stub = sandbox.stub(Limiter, 'buildLimiter').callsFake((name: string, limit: number) => {
    upperLimit = limit;
    return limiter;
  });

  return { stub, limiter };
}
