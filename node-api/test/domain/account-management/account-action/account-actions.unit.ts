import * as sinon from 'sinon';
import { expect } from 'chai';
import {
  AccountAction,
  AccountActionError,
} from '../../../../src/domain/account-management/account-action';
import { ILoggerInterface } from '@dave-inc/logger';

describe('Account Management [Unit Tests] AccountActions', async () => {
  let sandbox: sinon.SinonSandbox;

  before(() => {
    sandbox = sinon.createSandbox();
  });

  afterEach(async () => {
    sandbox.restore();
    sandbox.reset();
  });

  it(`AccountActions: should be constructable with a name, type, and a promise`, async () => {
    const actionName = 'foo';
    const actionResult = 'bar';
    const actionPromise = Promise.resolve(actionResult);

    const sut = new AccountAction(actionName, 'remove', actionPromise);

    expect(sut.name).to.equal(actionName);
    expect(sut.type).to.equal('remove');
  });

  it(`AccountActions: should be constructable with a name, type, a promise, & a logging interface`, async () => {
    const actionName = 'foo';
    const actionResult = 'bar';
    const actionPromise = Promise.resolve(actionResult);
    const actionLogger: ILoggerInterface = {
      debug: () => {},
      warn: () => {},
      info: () => {},
      error: () => {},
    };

    const sut = new AccountAction(actionName, 'remove', actionPromise, actionLogger);

    expect(sut.name).to.equal(actionName);
    expect(sut.type).to.equal('remove');
    expect(sut.logger).to.deep.equal(actionLogger);
  });

  it(`AccountActions: execute() should return the action's name/result tuple`, async () => {
    const actionName = 'foo';
    const actionResult = 'bar';
    const actionPromise = Promise.resolve(actionResult);
    const sut = new AccountAction(actionName, 'remove', actionPromise);

    const result = await sut.execute();

    expect(result).to.be.deep.equal([actionName, actionResult]);
  });

  it(`AccountActions: execute() should log at a debug level when things succeed`, async () => {
    const actionName = 'foo';
    const actionResult = 'bar';
    const actionPromise = Promise.resolve(actionResult);
    const actionLogger: ILoggerInterface = {
      debug: () => {},
      warn: () => {},
      info: () => {},
      error: () => {},
    };
    const sut = new AccountAction(actionName, 'remove', actionPromise, actionLogger);
    const debugLogSpy = sandbox.spy(actionLogger, 'debug');

    const result = await sut.execute();

    expect(result).to.be.deep.equal([actionName, actionResult]);
    expect(debugLogSpy).to.have.been.calledOnce;
  });

  it(`AccountActions: execute() should log at an error level whenever an error is thrown`, async () => {
    const actionName = 'foo';
    const actionPromise = Promise.reject(new Error('account action error'));
    const actionLogger: ILoggerInterface = {
      debug: () => {},
      warn: () => {},
      info: () => {},
      error: () => {},
    };
    const sut = new AccountAction(actionName, 'remove', actionPromise, actionLogger);
    const errorLogSpy = sandbox.spy(actionLogger, 'error');

    const result = sut.execute();

    await expect(result).to.eventually.be.rejectedWith(AccountActionError, 'account action error');
    expect(errorLogSpy).to.have.been.calledOnce;
  });
});
