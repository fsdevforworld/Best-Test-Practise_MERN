import * as bulkUpdateHelpers from '../../../../../src/services/internal-dashboard-api/domain/dashboard-bulk-update/helpers';
import * as sinon from 'sinon';
import factory from '../../../../factories';
import { ActionCode } from '../../../../../src/services/internal-dashboard-api/domain/action-log';
import { clean } from '../../../../test-helpers';
import { expect } from 'chai';
import {
  AccountStatus,
  ApiAccountType,
  IInternalApiBankAccount,
} from '@dave-inc/banking-internal-api-client';
import {
  BulkUpdateProcessInput,
  validAccountTypes,
} from '../../../../../src/services/internal-dashboard-api/domain/dashboard-bulk-update/dashboard-bulk-update-typings';
import {
  cstUpdate,
  fetchAllAccountsForCstUpdate,
  processBulkCstUpdate,
  processCstCancelWithoutRefund,
  processCstSuspendAndDisable,
} from '../../../../../src/services/internal-dashboard-api/domain/dashboard-bulk-update/process-bulk-cst-update';

import {
  FAILED_FETCHING_BANK_ACCOUNTS,
  INVALID_CST_OPERATION,
  MISSING_EXTRA_FIELD,
  NO_ACCOUNT_FOUND,
  USER_DOES_NOT_EXIST,
} from '../../../../../src/services/internal-dashboard-api/domain/dashboard-bulk-update/error-messages';

describe('Dashboard Bulk CST Update', () => {
  const sandbox = sinon.createSandbox();
  const extraFieldChecking = { accountType: validAccountTypes[0] };

  const mockAccountChecking: IInternalApiBankAccount = {
    id: 'someMockId1',
    name: 'someBankAccountName1',
    accountType: ApiAccountType.Checking,
    status: AccountStatus.Active,
    accountNumber: 'someBankAccountNumber1',
    currentBalance: 123,
    createdAt: 'someTimestamp1',
    routingNumber: 'someRoutingNumber1',
  };

  const mockAccountGoal: IInternalApiBankAccount = {
    id: 'someMockId2',
    name: 'someBankAccountName2',
    accountType: ApiAccountType.Goal,
    status: AccountStatus.Active,
    accountNumber: 'someBankAccountNumber2',
    currentBalance: 123,
    createdAt: 'someTimestamp2',
    routingNumber: 'someRoutingNumber2',
  };

  const mockAccountExtraCash: IInternalApiBankAccount = {
    id: 'someMockId3',
    name: 'someBankAccountName3',
    accountType: ApiAccountType.ExtraCash,
    status: AccountStatus.Active,
    accountNumber: 'someBankAccountNumber3',
    currentBalance: 123,
    createdAt: 'someTimestamp3',
    routingNumber: 'someRoutingNumber3',
  };

  before(() => clean(sandbox));

  afterEach(() => clean(sandbox));

  describe('processCstCancelWithoutRefund', async () => {
    describe('when a note is passed', async () => {
      it('should return an error when updateBankAccount fails the cancel request', async () => {
        const updateAccountStub = sandbox
          .stub(bulkUpdateHelpers, 'updateBankAccount')
          .throws(new Error('someError'));

        try {
          await processCstCancelWithoutRefund(mockAccountChecking, 'someNote');
          throw new Error('Test should have failed');
        } catch (error) {
          expect(error.message).to.equal('someError');
          expect(updateAccountStub).to.have.callCount(1);
        }
      });
      it('should return an error when updateBankAccount fails the addNote request', async () => {
        const updateAccountStub = sandbox.stub(bulkUpdateHelpers, 'updateBankAccount');
        updateAccountStub.onFirstCall().returns(true);
        updateAccountStub.onSecondCall().throws(new Error('someError'));

        try {
          await processCstCancelWithoutRefund(mockAccountChecking, 'someNote');
          throw new Error('Test should have failed');
        } catch (error) {
          expect(error.message).to.equal('someError');
          expect(updateAccountStub).to.have.callCount(2);
        }
      });
      it('succeeds cancelling and adding the note', async () => {
        const updateAccountStub = sandbox
          .stub(bulkUpdateHelpers, 'updateBankAccount')
          .returns(true);
        await processCstCancelWithoutRefund(mockAccountChecking, 'someNote');

        expect(updateAccountStub).to.have.callCount(2);
      });
    });
    describe('when a note is NOT passed', async () => {
      it('should return an error when updateBankAccount fails the cancel request', async () => {
        const updateAccountStub = sandbox
          .stub(bulkUpdateHelpers, 'updateBankAccount')
          .throws(new Error('someError'));

        try {
          await processCstCancelWithoutRefund(mockAccountChecking);
          throw new Error('Test should have failed');
        } catch (error) {
          expect(error.message).to.equal('someError');
          expect(updateAccountStub).to.have.callCount(1);
        }
      });
      it('succeeds cancelling', async () => {
        const updateAccountStub = sandbox
          .stub(bulkUpdateHelpers, 'updateBankAccount')
          .returns(true);
        await processCstCancelWithoutRefund(mockAccountChecking);

        expect(updateAccountStub).to.have.callCount(1);
      });
    });
  });

  describe('processCstSuspendAndDisable', async () => {
    describe('when a note is passed', async () => {
      it('should return an error when updateBankAccount fails the suspend request', async () => {
        const updateAccountStub = sandbox
          .stub(bulkUpdateHelpers, 'updateBankAccount')
          .throws(new Error('someError'));

        try {
          await processCstSuspendAndDisable(mockAccountChecking, 'someNote');
          throw new Error('Test should have failed');
        } catch (error) {
          expect(error.message).to.equal('someError');
          expect(updateAccountStub).to.have.callCount(1);
        }
      });
      it('should return an error when updateCardsByAccountId fails ', async () => {
        const updateAccountStub = sandbox
          .stub(bulkUpdateHelpers, 'updateBankAccount')
          .returns(true);

        const disableCardsStub = sandbox
          .stub(bulkUpdateHelpers, 'updateCardsByAccountId')
          .throws(new Error('someError'));

        try {
          await processCstSuspendAndDisable(mockAccountChecking, 'someNote');
          throw new Error('Test should have failed');
        } catch (error) {
          expect(error.message).to.equal('someError');
          expect(updateAccountStub).to.have.callCount(1);
          expect(disableCardsStub).to.have.callCount(1);
        }
      });
      it('should return an error when updateBankAccount fails the addNote request', async () => {
        const updateAccountStub = sandbox.stub(bulkUpdateHelpers, 'updateBankAccount');
        updateAccountStub.onFirstCall().returns(true);
        updateAccountStub.onSecondCall().throws(new Error('someError'));

        const disableCardsStub = sandbox
          .stub(bulkUpdateHelpers, 'updateCardsByAccountId')
          .returns(true);

        try {
          await processCstSuspendAndDisable(mockAccountChecking, 'someNote');
          throw new Error('Test should have failed');
        } catch (error) {
          expect(error.message).to.equal('someError');
          expect(updateAccountStub).to.have.callCount(2);
          expect(disableCardsStub).to.have.callCount(1);
        }
      });
      it('succeeds suspending and cancelling and adding the note', async () => {
        const updateAccountStub = sandbox
          .stub(bulkUpdateHelpers, 'updateBankAccount')
          .returns(true);

        const disableCardsStub = sandbox
          .stub(bulkUpdateHelpers, 'updateCardsByAccountId')
          .returns(true);

        await processCstSuspendAndDisable(mockAccountChecking, 'someNote');

        expect(updateAccountStub).to.have.callCount(2);
        expect(disableCardsStub).to.have.callCount(1);
      });
    });
    describe('when a note is NOT passed', async () => {
      it('should return an error when updateBankAccount fails the cancel request', async () => {
        const updateAccountStub = sandbox
          .stub(bulkUpdateHelpers, 'updateBankAccount')
          .returns(true);
        const disableCardsStub = sandbox
          .stub(bulkUpdateHelpers, 'updateCardsByAccountId')
          .throws(new Error('someError'));

        try {
          await processCstSuspendAndDisable(mockAccountChecking);
          throw new Error('Test should have failed');
        } catch (error) {
          expect(error.message).to.equal('someError');
          expect(updateAccountStub).to.have.callCount(1);
          expect(disableCardsStub).to.have.callCount(1);
        }
      });
      it('should return an error when updateCardsByAccountId fails ', async () => {
        const updateAccountStub = sandbox
          .stub(bulkUpdateHelpers, 'updateBankAccount')
          .returns(true);
        const disableCardsStub = sandbox
          .stub(bulkUpdateHelpers, 'updateCardsByAccountId')
          .throws(new Error('someError'));

        try {
          await processCstSuspendAndDisable(mockAccountChecking);
          throw new Error('Test should have failed');
        } catch (error) {
          expect(error.message).to.equal('someError');
          expect(updateAccountStub).to.have.callCount(1);
          expect(disableCardsStub).to.have.callCount(1);
        }
      });
      it('succeeds suspending and cancelling', async () => {
        const updateAccountStub = sandbox
          .stub(bulkUpdateHelpers, 'updateBankAccount')
          .returns(true);

        const disableCardsStub = sandbox
          .stub(bulkUpdateHelpers, 'updateCardsByAccountId')
          .returns(true);

        await processCstSuspendAndDisable(mockAccountChecking);

        expect(updateAccountStub).to.have.callCount(1);
        expect(disableCardsStub).to.have.callCount(1);
      });
    });
  });

  describe('fetchAllAccountsForCstUpdate', async () => {
    it('should throw an error if getUserBankAccounts returns a bad response', async () => {
      const getBankAccountsStub = sandbox
        .stub(bulkUpdateHelpers, 'getUserBankAccounts')
        .returns(undefined);

      const user = await factory.create('user');

      try {
        await fetchAllAccountsForCstUpdate(user, validAccountTypes[0]);
        throw new Error('Test should have failed');
      } catch (error) {
        expect(error.message).to.equal(FAILED_FETCHING_BANK_ACCOUNTS);
        expect(getBankAccountsStub).to.have.callCount(1);
      }
    });
    it('should throw an error if getUserBankAccounts returns an empty list', async () => {
      const getBankAccountsStub = sandbox
        .stub(bulkUpdateHelpers, 'getUserBankAccounts')
        .returns({ data: { bankAccounts: [], pendingAccounts: [] } });

      const user = await factory.create('user');

      try {
        await fetchAllAccountsForCstUpdate(user, validAccountTypes[0]);
        throw new Error('Test should have failed');
      } catch (error) {
        expect(error.message).to.equal(NO_ACCOUNT_FOUND);
        expect(getBankAccountsStub).to.have.callCount(1);
      }
    });
    it('should throw an error if getUserBankAccounts returns accounts, but the accountType is not Checking or Goal', async () => {
      const getBankAccountsStub = sandbox
        .stub(bulkUpdateHelpers, 'getUserBankAccounts')
        .returns({ data: { bankAccounts: [mockAccountChecking], pendingAccounts: [] } });

      const user = await factory.create('user');

      try {
        await fetchAllAccountsForCstUpdate(user, ApiAccountType.ExtraCash);
        throw new Error('Test should have failed');
      } catch (error) {
        expect(error.message).to.equal(NO_ACCOUNT_FOUND);
        expect(getBankAccountsStub).to.have.callCount(1);
      }
    });
    it('should return Checking and Goal accounts if Checking is passed as Account Type ', async () => {
      sandbox.stub(bulkUpdateHelpers, 'getUserBankAccounts').returns({
        data: {
          bankAccounts: [mockAccountChecking, mockAccountGoal, mockAccountExtraCash],
          pendingAccounts: [],
        },
      });

      const user = await factory.create('user');

      const result = await fetchAllAccountsForCstUpdate(user, ApiAccountType.Checking);

      expect(result.length).to.equal(2);
    });
    it('should only return Goal accounts if Goal is passed as Account Type ', async () => {
      sandbox.stub(bulkUpdateHelpers, 'getUserBankAccounts').returns({
        data: {
          bankAccounts: [mockAccountChecking, mockAccountGoal, mockAccountExtraCash],
          pendingAccounts: [],
        },
      });

      const user = await factory.create('user');

      const result = await fetchAllAccountsForCstUpdate(user, ApiAccountType.Goal);

      expect(result.length).to.equal(1);
    });
  });

  describe('cstUpdate', async () => {
    it('should throw an error if an invalid action is given', async () => {
      const user = await factory.create('user');

      try {
        await cstUpdate(user, validAccountTypes[0], 'someBadOperation', 'someNote');
        throw new Error('Test should have failed');
      } catch (error) {
        expect(error.message).to.contain(INVALID_CST_OPERATION);
      }
    });
    it('should throw an error if getUserBankAccounts fails', async () => {
      // Making it fail by returning no bank accounts
      const getBankAccountsStub = sandbox
        .stub(bulkUpdateHelpers, 'getUserBankAccounts')
        .returns({ data: { bankAccounts: [], pendingAccounts: [] } });

      const user = await factory.create('user');

      try {
        await cstUpdate(user, validAccountTypes[0], ActionCode.BulkUpdateCstSuspend, 'someNote');
        throw new Error('Test should have failed');
      } catch (error) {
        expect(error.message).to.equal(NO_ACCOUNT_FOUND);
        expect(getBankAccountsStub).to.have.callCount(1);
      }
    });
    it('should call processCstCancelWithoutRefund if performing a cancelWORefund operation ', async () => {
      const updateAccountStub = sandbox.stub(bulkUpdateHelpers, 'updateBankAccount').returns(true);
      sandbox.stub(bulkUpdateHelpers, 'getUserBankAccounts').returns({
        data: {
          bankAccounts: [mockAccountChecking, mockAccountGoal, mockAccountExtraCash],
          pendingAccounts: [],
        },
      });
      const disableCardsStub = sandbox
        .stub(bulkUpdateHelpers, 'updateCardsByAccountId')
        .returns(true);

      const user = await factory.create('user');

      // validAccountTypes[0] = Checking
      await cstUpdate(
        user,
        validAccountTypes[0],
        ActionCode.BulkUpdateCstCancelWithoutRefund,
        'someNote',
      );

      // Called 4 times, 2 for checking, 2 for goal
      expect(updateAccountStub).to.have.callCount(4);
      expect(disableCardsStub).to.have.callCount(0);
    });
    it('should call processCstSuspendAndDisable if performing a suspend operation ', async () => {
      const updateAccountStub = sandbox.stub(bulkUpdateHelpers, 'updateBankAccount').returns(true);
      sandbox.stub(bulkUpdateHelpers, 'getUserBankAccounts').returns({
        data: {
          bankAccounts: [mockAccountChecking, mockAccountGoal, mockAccountExtraCash],
          pendingAccounts: [],
        },
      });
      const disableCardsStub = sandbox
        .stub(bulkUpdateHelpers, 'updateCardsByAccountId')
        .returns(true);

      const user = await factory.create('user');

      // validAccountTypes[0] = Checking
      await cstUpdate(user, validAccountTypes[0], ActionCode.BulkUpdateCstSuspend, 'someNote');

      // Called 4 times, 2 for checking, 2 for goal
      expect(updateAccountStub).to.have.callCount(4);
      expect(disableCardsStub).to.have.callCount(2);
    });
  });

  describe('processBulkCstUpdate', async () => {
    describe('When we try to process a list of input users', async () => {
      describe('But the extra field is missing', async () => {
        it('throws an error', async () => {
          const mockInput: BulkUpdateProcessInput = {
            inputUsers: [90210],
            dashboardBulkUpdateId: 0,
            internalUserId: -1,
            primaryAction: 'someAction',
            actionLogNote: 'someNote',
            reason: 'someReason',
          };

          try {
            await processBulkCstUpdate(mockInput);
            throw new Error('Test should have failed');
          } catch (error) {
            expect(error.message).to.equal(MISSING_EXTRA_FIELD);
          }
        });
      });
      describe('And the list is an empty list', async () => {
        it('returns an empty list of output rows', async () => {
          const mockInput: BulkUpdateProcessInput = {
            inputUsers: [],
            dashboardBulkUpdateId: 0,
            internalUserId: -1,
            primaryAction: 'someAction',
            actionLogNote: 'someNote',
            reason: 'someReason',
            extra: extraFieldChecking,
          };

          const result = await processBulkCstUpdate(mockInput);
          expect(result.length).to.equal(0);
        });
      });
      describe('And the list is an a user that does not exist', async () => {
        it('returns an a list with the expected error', async () => {
          const mockInput: BulkUpdateProcessInput = {
            inputUsers: [90210],
            dashboardBulkUpdateId: 0,
            internalUserId: -1,
            primaryAction: 'someAction',
            actionLogNote: 'someNote',
            reason: 'someReason',
            extra: extraFieldChecking,
          };
          const result = await processBulkCstUpdate(mockInput);

          expect(result.length).to.equal(1);
          expect(result[0].error).to.contain(USER_DOES_NOT_EXIST);
        });
      });
      describe('And the list is an a user that does exist', async () => {
        describe('and cstUpdate fails', async () => {
          it('returns an a list with the expected error', async () => {
            const mockInput: BulkUpdateProcessInput = {
              inputUsers: [90210],
              dashboardBulkUpdateId: 0,
              internalUserId: -1,
              primaryAction: 'someAction',
              actionLogNote: 'someNote',
              reason: 'someReason',
              extra: extraFieldChecking,
            };
            const result = await processBulkCstUpdate(mockInput);

            expect(result.length).to.equal(1);
            expect(result[0].error).to.contain(USER_DOES_NOT_EXIST);
          });
        });
        describe('and cstUpdate succeeds', async () => {
          it('returns an a list with no error', async () => {
            sandbox.stub(bulkUpdateHelpers, 'updateBankAccount').returns(true);
            sandbox.stub(bulkUpdateHelpers, 'getUserBankAccounts').returns({
              data: {
                bankAccounts: [mockAccountChecking, mockAccountGoal, mockAccountExtraCash],
                pendingAccounts: [],
              },
            });
            sandbox.stub(bulkUpdateHelpers, 'updateCardsByAccountId').returns(true);

            const user = await factory.create('user');

            const mockInput: BulkUpdateProcessInput = {
              inputUsers: [user.id],
              dashboardBulkUpdateId: 0,
              internalUserId: -1,
              primaryAction: ActionCode.BulkUpdateCstSuspend,
              actionLogNote: 'someNote',
              reason: 'someReason',
              extra: extraFieldChecking,
            };
            const result = await processBulkCstUpdate(mockInput);

            expect(result.length).to.equal(1);
            expect(result[0].error).to.be.undefined;
          });
        });
      });
    });
  });
});
