import { SynapsePayError } from '../../lib/error';
import { ResponseError } from 'superagent';
import * as SynapsePay from 'synapsepay';
import * as Bluebird from 'bluebird';
// https://github.com/synapsepayments/SynapsePay-Node/blob/master/samples.md
Bluebird.promisifyAll(SynapsePay.User.prototype);
Bluebird.promisifyAll(SynapsePay.Node.prototype);

function wrapClass<T extends object>(target: T): T {
  for (const propName of Object.getOwnPropertyNames(target)) {
    const prop = Reflect.get(target, propName);
    if (typeof prop === 'function') {
      Reflect.set(target, propName, wrapMethod(prop));
    }
  }
  return target;
}

function wrapMethod<T extends (...args: any[]) => any>(
  fn: T,
): (...fnArgs: Parameters<T>) => Promise<ReturnType<T>> {
  return async function(...args: Parameters<T>): Promise<ReturnType<T>> {
    try {
      return await fn.apply(this, args);
    } catch (e) {
      throw wrapError(e);
    }
  };
}

function requestSucceeded(error: ResponseError): boolean {
  return !!error.response || !!error.status;
}

function wrapError(error: ResponseError): Error | ResponseError {
  if (requestSucceeded(error)) {
    return error;
  }

  // Errors for requests to Synapse that don't succeed (e.g., network errors)
  const wrappedError = new SynapsePayError();
  wrappedError.data = { originalError: error };
  return wrappedError;
}

export const users = wrapClass(Bluebird.promisifyAll(SynapsePay.Users));
export const user = wrapClass(Bluebird.promisifyAll(SynapsePay.User));
export const nodes = wrapClass(Bluebird.promisifyAll(SynapsePay.Nodes));
export const statements = wrapClass(Bluebird.promisifyAll(SynapsePay.Statements));
export const transactions = wrapClass(Bluebird.promisifyAll(SynapsePay.Transactions));
export const helpers = SynapsePay.Helpers;
