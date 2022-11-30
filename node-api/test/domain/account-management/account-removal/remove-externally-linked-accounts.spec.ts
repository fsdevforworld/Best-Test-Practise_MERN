import * as sinon from 'sinon';
import { clean } from '../../../test-helpers';
import { expect } from 'chai';
import {
  AccountRemovalAction,
  removeAllUserBankConnections,
  removeExternallyLinkedAccounts,
} from '../../../../src/domain/account-management/account-removal';
import factory from '../../../factories';
import { SynapsepayDocument, User } from '../../../../src/models';
import * as DeleteBankAccount from '../../../../src/services/loomis-api/domain/delete-bank-account';
import * as UserHelper from '../../../../src/helper/user';
import * as SynapseDomain from '../../../../src/domain/synapsepay';
import braze from '../../../../src/lib/braze';
import * as ActionProcessor from '../../../../src/domain/account-management/account-action/processor';
import { processBatchAccountActions } from '../../../../src/domain/account-management/account-action/processor';
import {
  AccountActionError,
  AccountActionSuccess,
  AccountRemovalEvent,
} from '../../../../src/domain/account-management/account-action';
import logger from '../../../../src/lib/logger';
import * as UserProxy from '../../../../src/domain/account-management/account-removal/user-proxy';

const stubExternalAccountRemovalActions = (sandbox: sinon.SinonSandbox) => {
  return {
    deleteMxUserStub: sandbox.stub(UserHelper, 'deleteMxUser').resolves(),
    deleteSynapsePayUserStub: sandbox.stub(SynapseDomain, 'deleteSynapsePayUser').resolves(),
    destroySynapseDocumentStub: sandbox.stub(SynapsepayDocument, 'destroy').resolves(),
    deleteBrazeUserStub: sandbox.stub(braze, 'deleteUser').resolves(),
  };
};

describe('Account Management [Integration Tests] AccountRemoval', async () => {
  const sandbox = sinon.createSandbox();

  beforeEach(() => {
    sandbox.stub(logger, 'error').resolves();
    sandbox.stub(logger, 'debug').resolves();
  });
  afterEach(async () => clean(sandbox));

  describe('removeAllUserBankConnections() should', async () => {
    it('return success if all bank connections associated with a user are deleted', async () => {
      sandbox.stub(User, 'create').resolves({ id: 1 });
      const user = await User.create();
      sandbox.stub(UserProxy, 'getBankConnections').returns([{ id: 1 }]);

      sandbox.stub(DeleteBankAccount, 'deleteBankConnection').resolves();
      // @ts-ignore
      const response = await removeAllUserBankConnections(user);
      expect((response as AccountActionSuccess<void[]>).result.length).to.be.eq(1);
    });

    it('return failure if deleteBankConnection rejects', async () => {
      sandbox.stub(User, 'create').resolves({ id: 1 });
      const user = await User.create();
      sandbox.stub(UserProxy, 'getBankConnections').returns([{ id: 1 }]);

      const error = new AccountActionError('deleteBankConnections', 'remove', 'hi');
      sandbox.stub(DeleteBankAccount, 'deleteBankConnection').rejects(error);

      await expect(removeAllUserBankConnections(user)).to.eventually.be.rejectedWith(
        AccountActionError,
        `[user-account-removal] Failure occurred during attempt to remove user's bank connections (removeAllUserBankConnections) (account-action:remove)`,
      );
    });
  });

  describe('removeExternallyLinkedAccounts() should', async () => {
    it('call all delete functions eagerly', async () => {
      const user = await factory.create<User>('user', {
        id: 1,
        mxUserId: 'hi',
      });

      const {
        deleteSynapsePayUserStub,
        destroySynapseDocumentStub,
        deleteBrazeUserStub,
      } = stubExternalAccountRemovalActions(sandbox);
      sandbox.stub(ActionProcessor, 'processBatchAccountActions').resolves();

      await removeExternallyLinkedAccounts(user);

      expect(deleteSynapsePayUserStub).to.have.been.callCount(1);
      expect(destroySynapseDocumentStub).to.have.been.callCount(1);
      expect(deleteBrazeUserStub).to.have.been.callCount(1);
    });

    it('call deleteMxUser if the user is an mxUser', async () => {
      const user = await factory.create<User>('user', {
        id: 1,
        mxUserId: 'hi',
      });

      const { deleteMxUserStub } = stubExternalAccountRemovalActions(sandbox);
      sandbox.spy(ActionProcessor, 'processBatchAccountActions');

      await removeExternallyLinkedAccounts(user);

      expect(deleteMxUserStub).to.have.been.callCount(1);
    });

    it('not call deleteMxUser if the user is not an mxUser', async () => {
      const user = await factory.create<User>('user', {
        id: 1,
      });

      const { deleteMxUserStub } = stubExternalAccountRemovalActions(sandbox);
      sandbox.spy(processBatchAccountActions);

      await removeExternallyLinkedAccounts(user);

      expect(deleteMxUserStub).to.have.been.callCount(0);
    });

    it('removeExternallyLinkedAccounts() to be called with the expected arguments', async () => {
      const user = await factory.create<User>('user', {});

      stubExternalAccountRemovalActions(sandbox);
      const processBatchAccountActionsSpy = sandbox.spy(
        ActionProcessor,
        'processBatchAccountActions',
      );

      await removeExternallyLinkedAccounts(user);

      const processActionArgs = processBatchAccountActionsSpy.firstCall.args;

      await expect(removeExternallyLinkedAccounts(user)).to.eventually.be.fulfilled.and.then(
        _result => {
          const arg0 = (processActionArgs[1] as AccountRemovalAction[]).map(each => each.name);
          for (const arg of [
            'deleteMxUser',
            'deleteSynapsePayUser',
            'deleteSynapsePayDocument',
            'deleteBrazeUser',
          ]) {
            expect(arg0).to.contain(arg);
          }
          expect(processActionArgs[3]).to.eq(AccountRemovalEvent);
          expect(processActionArgs[2]).to.eq(user);
        },
      );
    });
  });
});
