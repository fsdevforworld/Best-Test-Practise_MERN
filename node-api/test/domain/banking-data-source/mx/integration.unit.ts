import { BankAccountSubtype, BankAccountType, BankingDataSource } from '@dave-inc/wire-typings';
import { TimeoutError } from 'bluebird';
import { expect } from 'chai';
import * as sinon from 'sinon';

import { replayHttp } from '../../../test-helpers';

import { MxIntegration } from '../../../../src/domain/banking-data-source';
import { BankingDataSourceError } from '../../../../src/domain/banking-data-source/error';

import { BankingDataSourceErrorType, MxConnectionStatus } from '../../../../src/typings';

import { moment } from '@dave-inc/time-lib';
import * as utils from '../../../../src/lib/utils';

describe('Mx Domain', () => {
  const sandbox = sinon.createSandbox();

  const userGuid = 'USR-fake-user-guid';
  const memberGuid = 'MBR-fake-member-guid';
  const mx = new MxIntegration(userGuid, memberGuid);
  let pollStub: sinon.SinonStub;

  beforeEach(() => {
    const originalPoll = utils.poll;

    // Overload poll method to have no delay and faster timeout to speed up tests
    pollStub = sandbox.stub(utils, 'poll').callsFake((promiseCreator, options) => {
      return originalPoll(promiseCreator, { ...options, delayMs: 0, timeoutMs: 1000 });
    });
  });

  afterEach(() => sandbox.restore());

  describe('getAccounts', () => {
    it(
      'should immediately return a list of accounts associated with the member when not aggregating',
      replayHttp('mx/notAggregating-listMemberAccounts-success.json', async () => {
        const result = await mx.getAccounts();

        expect(result).deep.equal([
          {
            bankingDataSource: BankingDataSource.Mx,
            externalId: 'ACT-06d7f44b-caae-0f6e-1383-01f52e75dcb1',
            available: 1000,
            current: 1000,
            nickname: 'Test Checking Account 1',
            type: BankAccountType.Depository,
            subtype: BankAccountSubtype.Checking,
            account: undefined,
            routing: undefined,
            lastFour: null,
          },
          {
            bankingDataSource: BankingDataSource.Mx,
            externalId: 'ACT-04323j-caae-0f3fe-1384-01f234e75dcb1',
            available: 2000,
            current: 2000,
            nickname: 'Test Checking Account 2',
            type: BankAccountType.Depository,
            subtype: BankAccountSubtype.Checking,
            account: undefined,
            routing: undefined,
            lastFour: null,
          },
        ]);
      }),
    );

    it(
      'should poll until aggregation is finished and then return a list of accounts associated with the member',
      replayHttp(
        'mx/aggregating-pollConnectionStatus-listMemberAccounts-success.json',
        async () => {
          const result = await mx.getAccounts();

          expect(result).deep.equal([
            {
              bankingDataSource: BankingDataSource.Mx,
              externalId: 'ACT-06d7f44b-caae-0f6e-1383-01f52e75dcb1',
              available: 1000,
              current: 1000,
              nickname: 'Test Checking Account 1',
              type: BankAccountType.Depository,
              subtype: BankAccountSubtype.Checking,
              account: undefined,
              routing: undefined,
              lastFour: null,
            },
            {
              bankingDataSource: BankingDataSource.Mx,
              externalId: 'ACT-04323j-caae-0f3fe-1384-01f234e75dcb1',
              available: 2000,
              current: 2000,
              nickname: 'Test Checking Account 2',
              type: BankAccountType.Depository,
              subtype: BankAccountSubtype.Checking,
              account: undefined,
              routing: undefined,
              lastFour: null,
            },
          ]);
        },
      ),
    );

    it(
      'should throw an error when the member can not be found',
      replayHttp('mx/aggregating-pollConnectionStatus-500.json', async () => {
        let errorThrown: BankingDataSourceError;

        try {
          await mx.getAccounts();
        } catch (e) {
          errorThrown = e;
        }

        expect(errorThrown).to.exist;
        expect(errorThrown).to.be.instanceOf(BankingDataSourceError);
        expect(errorThrown).to.deep.include({
          message: 'Internal server error',
          bankingDataSource: BankingDataSource.Mx,
          errorCode: '500',
          httpCode: 500,
          errorType: BankingDataSourceErrorType.InternalServerError,
        });
      }),
    );
  });

  describe('getAccountsWithAccountAndRouting', () => {
    it(
      'should trigger a verification, poll until aggregation is complete, and fetch a list of accounts with their respective account and routing numbers',
      replayHttp(
        'mx/triggerVerification-pollConnectionStatus-listAccountWithNumbers-success.json',
        async () => {
          const result = await mx.getAccountsWithAccountAndRouting();

          expect(result).to.deep.equal([
            {
              bankingDataSource: BankingDataSource.Mx,
              externalId: 'ACT-06d7f44b-caae-0f6e-1383-01f52e75dcb1',
              available: 1000,
              current: 1000,
              lastFour: '0001',
              nickname: 'Test Checking Account 1',
              account: '10001',
              routing: '55234324000',
              type: 'DEPOSITORY',
              subtype: 'CHECKING',
            },
            {
              bankingDataSource: BankingDataSource.Mx,
              externalId: 'ACT-04323j-caae-0f3fe-1384-01f234e75dcb1',
              available: 2000,
              current: 2000,
              lastFour: '0002',
              nickname: 'Test Checking Account 2',
              account: '10002',
              routing: '55234324000',
              type: 'DEPOSITORY',
              subtype: 'CHECKING',
            },
          ]);
        },
      ),
    );

    it(
      'should wait for initial aggregation to finish, trigger a verification, poll until aggregation is complete, and fetch a list of accounts with their respective account and routing numbers',
      replayHttp(
        'mx/waitForInitialAggregation-triggerVerification-pollConnectionStatus-listAccountWithNumbers-success.json',
        async () => {
          const result = await mx.getAccountsWithAccountAndRouting();

          expect(result).to.deep.equal([
            {
              bankingDataSource: BankingDataSource.Mx,
              externalId: 'ACT-06d7f44b-caae-0f6e-1383-01f52e75dcb1',
              available: 1000,
              current: 1000,
              lastFour: '0001',
              nickname: 'Test Checking Account 1',
              account: '10001',
              routing: '55234324000',
              type: 'DEPOSITORY',
              subtype: 'CHECKING',
            },
            {
              bankingDataSource: BankingDataSource.Mx,
              externalId: 'ACT-04323j-caae-0f3fe-1384-01f234e75dcb1',
              available: 2000,
              current: 2000,
              lastFour: '0002',
              nickname: 'Test Checking Account 2',
              account: '10002',
              routing: '55234324000',
              type: 'DEPOSITORY',
              subtype: 'CHECKING',
            },
          ]);
        },
      ),
    );

    it(
      'should throw error type NoAccountRoutingNumbers if account verification is not supported for this institution',
      replayHttp('mx/triggerVerification-accountVerificationNotSupported-400.json', async () => {
        let errorThrown: BankingDataSourceError;

        try {
          await mx.getAccountsWithAccountAndRouting();
        } catch (err) {
          errorThrown = err;
        }

        expect(errorThrown).to.exist;
        expect(errorThrown).to.be.instanceOf(BankingDataSourceError);
        expect(errorThrown).to.deep.include({
          message: "Member's institution does not support instant account verification.",
          bankingDataSource: BankingDataSource.Mx,
          errorCode: '400',
          httpCode: 400,
          errorType: BankingDataSourceErrorType.AccountNumbersNotSupported,
        });
      }),
    );

    it(
      'should throw an error if poll connection status 500s',
      replayHttp('mx/triggerVerification-pollConnectionStatus-500.json', async () => {
        let errorThrown: BankingDataSourceError;

        try {
          await mx.getAccountsWithAccountAndRouting();
        } catch (err) {
          errorThrown = err;
        }

        expect(errorThrown).to.exist;
        expect(errorThrown).to.be.instanceOf(BankingDataSourceError);
        expect(errorThrown).to.deep.include({
          message: 'Internal server error',
          bankingDataSource: BankingDataSource.Mx,
          errorCode: '500',
          httpCode: 500,
          errorType: BankingDataSourceErrorType.InternalServerError,
        });
      }),
    );

    it(
      'should throw an error if we detect the member is disconnected after aggregating',
      replayHttp(
        'mx/triggerVerification-pollConnectionStatus-memberDisconnected.json',
        async () => {
          let errorThrown: BankingDataSourceError;

          try {
            await mx.getAccountsWithAccountAndRouting();
          } catch (err) {
            errorThrown = err;
          }

          expect(errorThrown).to.exist;
          expect(errorThrown).to.be.instanceOf(BankingDataSourceError);
          expect(errorThrown).to.deep.include({
            message: 'Member is not connected',
            bankingDataSource: BankingDataSource.Mx,
            errorCode: MxConnectionStatus.Challenged,
            errorType: BankingDataSourceErrorType.UserInteractionRequired,
          });
        },
      ),
    );

    it(
      'should throw an error if timed out while polling for aggregation to complete',
      replayHttp(
        'mx/triggerVerification-pollConnectionStatus-listAccountWithNumbers-success.json',
        async () => {
          let errorThrown: BankingDataSourceError;

          pollStub.throws(new TimeoutError());

          try {
            await mx.getAccountsWithAccountAndRouting();
          } catch (err) {
            errorThrown = err;
          }

          expect(errorThrown).to.exist;
          expect(errorThrown).to.include({
            message: 'Timed out waiting for member aggregation to finish',
            bankingDataSource: BankingDataSource.Mx,
            errorType: BankingDataSourceErrorType.RequestTimedOut,
          });
        },
      ),
    );
  });

  describe('getBalance', () => {
    it(
      'should trigger an aggregation, poll until complete, and fetch a list of accounts with their respective updated balances',
      replayHttp(
        'mx/triggerAggregation-pollConnectionStatus-listMemberAccounts-success.json',
        async () => {
          const result = await mx.getBalance();

          expect(result).deep.equal([
            {
              bankingDataSource: BankingDataSource.Mx,
              externalId: 'ACT-06d7f44b-caae-0f6e-1383-01f52e75dcb1',
              available: 956,
              current: 955,
              nickname: 'Test Checking Account 1',
              type: BankAccountType.Depository,
              subtype: BankAccountSubtype.Checking,
              account: undefined,
              routing: undefined,
              lastFour: null,
            },
            {
              bankingDataSource: BankingDataSource.Mx,
              externalId: 'ACT-04323j-caae-0f3fe-1384-01f234e75dcb1',
              available: 1578,
              current: 1577,
              nickname: 'Test Checking Account 2',
              type: BankAccountType.Depository,
              subtype: BankAccountSubtype.Checking,
              account: undefined,
              routing: undefined,
              lastFour: null,
            },
          ]);
        },
      ),
    );

    it(
      'should throw an error when throttled',
      replayHttp('mx/triggerAggregation-throttled.json', async () => {
        let errorThrown: BankingDataSourceError;

        try {
          await mx.getBalance();
        } catch (err) {
          errorThrown = err;
        }

        expect(errorThrown).to.exist;
        expect(errorThrown).to.include({
          message: 'This member has already been aggregated in the last four hours.',
          bankingDataSource: BankingDataSource.Mx,
          errorType: BankingDataSourceErrorType.RateLimitExceeded,
        });
      }),
    );

    it(
      'should throw an error when connection status endpoint 500s',
      replayHttp('mx/triggerAggregation-pollConnectionStatus-500.json', async () => {
        let errorThrown: BankingDataSourceError;

        try {
          await mx.getBalance();
        } catch (err) {
          errorThrown = err;
        }

        expect(errorThrown).to.exist;
        expect(errorThrown).to.include({
          message: 'Internal Server Error',
          bankingDataSource: BankingDataSource.Mx,
          errorType: BankingDataSourceErrorType.InternalServerError,
        });
      }),
    );

    it(
      'should throw an error if timed out while polling for aggregation to complete',
      replayHttp(
        'mx/triggerAggregation-pollConnectionStatus-listMemberAccounts-success.json',
        async () => {
          let errorThrown: BankingDataSourceError;

          pollStub.throws(new TimeoutError());

          try {
            await mx.getBalance();
          } catch (err) {
            errorThrown = err;
          }

          expect(errorThrown).to.exist;
          expect(errorThrown).to.include({
            message: 'Timed out waiting for member aggregation to finish',
            bankingDataSource: BankingDataSource.Mx,
            errorType: BankingDataSourceErrorType.RequestTimedOut,
          });
        },
      ),
    );

    it(
      'should throw an error if detected member is disconnected after aggregation',
      replayHttp('mx/triggerAggregation-pollConnectionStatus-memberDisconnected.json', async () => {
        let errorThrown: BankingDataSourceError;

        try {
          await mx.getBalance();
        } catch (err) {
          errorThrown = err;
        }

        expect(errorThrown).to.exist;
        expect(errorThrown).to.include({
          message: 'Member is not connected',
          bankingDataSource: BankingDataSource.Mx,
          errorCode: MxConnectionStatus.Challenged,
          errorType: BankingDataSourceErrorType.UserInteractionRequired,
        });
      }),
    );
  });

  describe('deleteNexus', () => {
    it(
      'should successfully delete a nexus',
      replayHttp('mx/deleteMember-success.json', async () => {
        const result = await mx.deleteNexus();

        expect(result).to.be.true;
      }),
    );

    it(
      'should throw an error if member does not exist',
      replayHttp('mx/deleteMember-404.json', async () => {
        let errorThrown: BankingDataSourceError;

        try {
          await mx.deleteNexus();
        } catch (e) {
          errorThrown = e;
        }

        expect(errorThrown).to.exist;
        expect(errorThrown).to.be.instanceOf(BankingDataSourceError);
        expect(errorThrown).to.deep.include({
          message: 'We were unable to find the record you requested',
          bankingDataSource: BankingDataSource.Mx,
          errorCode: '404',
          httpCode: 404,
          errorType: BankingDataSourceErrorType.InvalidRequest,
        });
      }),
    );
  });

  describe('getTransactions', () => {
    it(
      'should successfully fetch a list of transactions for a given list of account IDs with filter options',
      replayHttp('mx/listAccountTransactions-success.json', async () => {
        const accountGuids = ['ACT-fake-account-guid-1', 'ACT-fake-account-guid-2'];
        const result = await mx.getTransactions('2019-08-01', '2019-09-01', accountGuids, {
          pageNumber: 0,
          perPage: 500,
        });

        expect(result).to.deep.eq([
          {
            externalId: 'TRN-fake-transaction-guid-1',
            pendingExternalId: 'TRN-fake-transaction-guid-1',
            bankAccountExternalId: 'ACT-fake-account-guid-1',
            amount: -61.11,
            transactionDate: moment('2019-08-06T13:00:00+00:00'),
            pending: false,
            externalName: 'Whole Foods',
            plaidCategory: ['Groceries'],
          },
          {
            externalId: 'TRN-fake-transaction-guid-2',
            pendingExternalId: 'TRN-fake-transaction-guid-2',
            bankAccountExternalId: 'ACT-fake-account-guid-1',
            amount: 23.4,
            transactionDate: moment('2019-08-26T13:00:00+00:00'),
            pending: false,
            externalName: 'Transfer',
            plaidCategory: ['Transfer'],
          },
          {
            externalId: 'TRN-fake-transaction-guid-3',
            pendingExternalId: 'TRN-fake-transaction-guid-3',
            bankAccountExternalId: 'ACT-fake-account-guid-2',
            amount: -75.99,
            transactionDate: moment('2019-08-06T13:00:00+00:00'),
            pending: false,
            externalName: 'Whole Foods',
            plaidCategory: ['Groceries'],
          },
          {
            externalId: 'TRN-fake-transaction-guid-4',
            pendingExternalId: 'TRN-fake-transaction-guid-4',
            bankAccountExternalId: 'ACT-fake-account-guid-2',
            amount: 52.5,
            transactionDate: moment('2019-08-26T13:00:00+00:00'),
            pending: false,
            externalName: 'Transfer',
            plaidCategory: ['Transfer'],
          },
        ]);
      }),
    );

    it(
      'should throw an error if transaction query is invalid',
      replayHttp('mx/listAccountTransactions-failure.json', async () => {
        let errorThrown: BankingDataSourceError;

        try {
          const accountGuids = ['ACT-fake-account-guid-1'];
          await mx.getTransactions('2019-08-01', '2019-09-01', accountGuids, {
            pageNumber: 0,
            perPage: 0,
          });
        } catch (e) {
          errorThrown = e;
        }

        expect(errorThrown).to.exist;
        expect(errorThrown).to.be.instanceOf(BankingDataSourceError);
        expect(errorThrown).to.deep.include({
          message: 'Pagination query parameter must be an integer greater than zero.',
          bankingDataSource: BankingDataSource.Mx,
          errorCode: '404',
          httpCode: 404,
          errorType: BankingDataSourceErrorType.InvalidRequest,
        });
      }),
    );
  });
});
