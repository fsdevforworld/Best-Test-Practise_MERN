import PlaidSource from '../../../src/domain/banking-data-source/plaid/integration';
import * as SynapsepayModels from '../../../src/domain/synapsepay/external-model-definitions';
import SynapsepayNodeLib from '../../../src/domain/synapsepay/node';
import * as SynapsepayUserLib from '../../../src/domain/synapsepay/user';
import braze from '../../../src/lib/braze';
import mxClient from '../../../src/lib/mx';
import * as sinon from 'sinon';
import { clean } from '../../test-helpers';
import factory from '../../factories';
import { BankingDataSource } from '@dave-inc/wire-typings';
import { expect } from 'chai';
import { User } from '../../../src/models';

import AccountManagement, {
  AccountRemovalError,
  BatchAccountActionsError,
} from '../../../src/domain/account-management';

describe('Account Management [Integration Tests] removeUserAccountById()', async () => {
  const sandbox = sinon.createSandbox();

  let deleteBrazeUserStub: sinon.SinonStub;

  before(async () => clean());

  beforeEach(async () => {
    sandbox.stub(SynapsepayUserLib, 'deleteSynapsePayUser').resolves();
    sandbox.stub(SynapsepayNodeLib, 'deleteSynapsePayNode').resolves();
    sandbox.stub(PlaidSource.prototype, 'deleteNexus').resolves();
    sandbox.stub(SynapsepayModels.users, 'getAsync').resolves({ updateAsync: (params: any) => {} });
    deleteBrazeUserStub = sandbox.stub(braze, 'deleteUser');
    return;
  });

  afterEach(async () => clean(sandbox));

  it('should properly delete the user', async () => {
    const user = await factory.create('user');

    await AccountManagement.removeUserAccountById({
      userId: user.id,
      reason: 'because',
      options: {
        additionalInfo: 'i said so',
      },
    });
    const deletedUser = await User.findByPk(user.id, { paranoid: false });
    expect(deletedUser.phoneNumber).to.match(new RegExp(`\\${user.phoneNumber}-deleted-\\d+$`));
    expect(deletedUser.overrideSixtyDayDelete).to.be.false;
    sinon.assert.calledOnce(deleteBrazeUserStub);
  });

  context('when the phone number is already marked deleted', () => {
    it('should not append a second -deleted- tag', async () => {
      const phoneNumber = '+11234567890';
      const user = await factory.create('user', {
        phoneNumber: `${phoneNumber}-deleted-1585950665`,
      });

      await AccountManagement.removeUserAccountById({
        userId: user.id,
        reason: 'because',
        options: {
          additionalInfo: 'i said so',
        },
      });
      const deletedUser = await User.findByPk(user.id, { paranoid: false });
      expect(deletedUser.phoneNumber).to.match(new RegExp(`\\${phoneNumber}-deleted-\\d+$`));
      expect(deletedUser.overrideSixtyDayDelete).to.be.false;
    });
  });

  it('should properly delete the user with them being marked as having 60 days override', async () => {
    const user = await factory.create('user');

    await AccountManagement.removeUserAccountById({
      userId: user.id,
      reason: 'because',
      options: {
        shouldOverrideSixtyDayDelete: true,
        additionalInfo: 'i said so',
      },
    });
    const deletedUser = await User.findByPk(user.id, { paranoid: false });
    expect(deletedUser.phoneNumber).to.match(new RegExp(`\\${user.phoneNumber}-deleted-\\d+$`));
    expect(deletedUser.overrideSixtyDayDelete).to.be.true;
  });

  it('should be able to create a user with an existing email if the previous user was deleted', async () => {
    const user = await factory.create('user');

    await AccountManagement.removeUserAccountById({
      userId: user.id,
      reason: 'because',
      options: {
        additionalInfo: 'i said so',
      },
    });
    const newUser = await factory.create('user', { email: user.email });
    expect(user.email).to.be.equal(newUser.email);
  });

  it('prevents Dave Banking users from being deleted', async () => {
    const user = await factory.create('user');
    await factory.create('bank-connection', {
      userId: user.id,
      bankingDataSource: BankingDataSource.BankOfDave,
    });

    const result = AccountManagement.removeUserAccountById({
      userId: user.id,
      reason: 'foo',
      options: { additionalInfo: 'bar' },
    });

    await expect(result)
      .to.eventually.be.rejectedWith(
        AccountRemovalError,
        '[user-account-removal] User cannot be deleted.',
      )
      .and.have.property('type', 'remove');
  });

  it('should delete the user and the associated mx user', async () => {
    const mxUserGuid = 'USR-fake-user-guid';
    const user = await factory.create<User>('user', { mxUserId: mxUserGuid });

    sandbox
      .stub(mxClient.users, 'deleteUser')
      .withArgs(mxUserGuid)
      .resolves();

    await AccountManagement.removeUserAccountById({
      userId: user.id,
      reason: 'because',
      options: {
        additionalInfo: 'i said so',
      },
    });
    const deletedUser = await User.findByPk(user.id, { paranoid: false });

    expect(deletedUser.isSoftDeleted()).to.be.true;
    expect(deletedUser.mxUserId).to.be.null;
  });

  it('should delete the user and remove mx user id if it is not a valid mx user object', async () => {
    const mxUserGuid = 'USR-fake-user-guid';
    const user = await factory.create<User>('user', { mxUserId: mxUserGuid });

    class MxNotFoundError extends Error {
      public response = { statusCode: 404 };
    }

    sandbox
      .stub(mxClient.users, 'deleteUser')
      .withArgs(mxUserGuid)
      .throws(new MxNotFoundError());

    await AccountManagement.removeUserAccountById({
      userId: user.id,
      reason: 'because',
      options: {
        additionalInfo: 'i said so',
      },
    });
    const deletedUser = await User.findByPk(user.id, { paranoid: false });

    expect(deletedUser.isSoftDeleted()).to.be.true;
    expect(deletedUser.mxUserId).to.be.null;
  });

  // tslint:disable-next-line: ban
  it('should bubble up any non 404 issues removing the mx user', async () => {
    const mxUserGuid = 'USR-fake-user-guid';

    let user = await factory.create<User>('user', { mxUserId: mxUserGuid });

    class MxInternalServerError extends Error {
      public response = { statusCode: 500 };
    }

    sandbox
      .stub(mxClient.users, 'deleteUser')
      .withArgs(mxUserGuid)
      .throws(new MxInternalServerError('mx error'));

    // DeleteAssocMxUser is contained in error message BEFORE the middleware translates it (internal only)
    await expect(
      AccountManagement.removeUserAccountById({
        userId: user.id,
        reason: 'because',
        options: {
          additionalInfo: 'i said so',
        },
      }),
    ).to.eventually.be.rejectedWith(BatchAccountActionsError, 'deleteMxUser');

    user = await User.findByPk(user.id, { paranoid: false });

    expect(user.isSoftDeleted()).to.be.false;
  });
});
