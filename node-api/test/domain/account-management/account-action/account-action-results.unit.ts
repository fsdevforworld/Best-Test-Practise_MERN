import * as sinon from 'sinon';
import { expect, use } from 'chai';
import chaiAsPromised from 'chai-as-promised';
import {
  AccountActionError,
  AccountActionResult,
  IPendingActionResult,
} from '../../../../src/domain/account-management/account-action';

describe('Account Management [Unit Tests] AccountActionResults', async () => {
  let sandbox: sinon.SinonSandbox;

  before(() => {
    sandbox = sinon.createSandbox();
  });

  use(() => chaiAsPromised);

  afterEach(async () => {
    sandbox.restore();
    sandbox.reset();
  });

  it('AccountActionResults: success() should resolve as an AccountActionSuccess', async () => {
    const successResult: IPendingActionResult<string, AccountActionError> = {
      outcome: 'success',
      result: 'foo',
    };

    const sut = new AccountActionResult(successResult);

    const response = await sut.success();

    expect(response.outcome).to.equal('success');
    expect(response.result).to.equal('foo');
  });

  it('AccountActionResults: failure() should reject as an AccountActionFailure', async () => {
    const error = new AccountActionError('fooAction', 'remove', 'foo failed!');
    const failureResult = { outcome: 'failure', error };

    const sut = new AccountActionResult(failureResult as any);

    try {
      await sut.failure();
    } catch (ex) {
      expect(ex).to.exist;
      expect(ex.outcome).to.equal('failure');
      expect(ex.error).to.equal(error);
    }
  });
});
