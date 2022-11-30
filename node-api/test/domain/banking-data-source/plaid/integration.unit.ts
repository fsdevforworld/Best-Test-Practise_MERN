import { BankAccountSubtype, BankAccountType, BankingDataSource } from '@dave-inc/wire-typings';
import { expect } from 'chai';

import { replayHttp } from '../../../test-helpers';

import { BankingDataSourceErrorType, PlaidErrorCode } from '../../../../src/typings';

import { BankingDataSourceError } from '../../../../src/domain/banking-data-source/error';
import PlaidIntegration from '../../../../src/domain/banking-data-source/plaid/integration';

describe('Plaid Domain', () => {
  describe('getAccounts', () => {
    it(
      'returns an array of accounts',
      replayHttp('plaid/getAccounts-success.json', async () => {
        const token = 'access-sandbox-01f630cc-e08f-4d89-9021-26a1577abcdf';
        const plaid = new PlaidIntegration(token);
        const result = await plaid.getAccounts();
        expect(result.length).to.eq(3);
        expect(result[0].bankingDataSource).to.eq(BankingDataSource.Plaid);
        expect(result[0].externalId).to.eq('3gKDDKlKoDioMVg6X8PGHgLpk8VBR5fqr68dL');
        expect(result[0].current).to.eq(110);
        expect(result[0].nickname).to.eq('Plaid Checking');
        expect(result[0].type).to.eq(BankAccountType.Depository);
        expect(result[0].lastFour).to.eq('0000');
        expect(result[0].available).to.eq(100);
        expect(result[0].subtype).to.eq(BankAccountSubtype.Checking);
      }),
    );

    it(
      'throws an error when account is not found',
      replayHttp('plaid/getAccounts-failure.json', async () => {
        const badToken = 'blah';
        const plaid = new PlaidIntegration(badToken);

        try {
          await plaid.getAccounts();
          throw Error('error not thrown');
        } catch (e) {
          expect(e.bankingDataSource).to.eq(BankingDataSource.Plaid);
          expect(e.errorCode).to.eq(PlaidErrorCode.InvalidAccessToken);
          expect(e.errorType).to.eq(BankingDataSourceErrorType.NoOp);
          expect(e.httpCode).to.eq(400);
        }
      }),
    );

    it(
      'only returns supported account types',
      replayHttp('plaid/getAccounts-success.json', async () => {
        const token = 'access-sandbox-01f630cc-e08f-4d89-9021-26a1577abcdf';
        const plaid = new PlaidIntegration(token);
        const result = await plaid.getAccounts();
        const lastFours = result.map(r => r.lastFour);
        expect(lastFours).to.include.members(['0000', '3333', '1111']);
        expect(lastFours).to.not.include.members(['2222', '4444']);
      }),
    );
  });

  describe('getAccountsWithAccountAndRouting', async () => {
    it(
      'returns all of the bank accounts with a list of account and routing numbers',
      replayHttp('plaid/getAuth-success.json', async () => {
        const token = 'access-sandbox-01f630cc-e08f-4d89-9021-26a1577abcdf';
        const plaid = new PlaidIntegration(token);
        const result = await plaid.getAccountsWithAccountAndRouting();
        const lastFours = result.map(r => r.lastFour);
        const accountNumbers = result.map(r => r.account);
        const routingNumbers = result.map(r => r.routing);

        expect(result).length(3);
        expect(lastFours).to.deep.equal(['0000', '1111', '3333']);
        expect(accountNumbers).to.deep.equal(['9900009606', '9900003243', '9900007627']);
        expect(routingNumbers).to.deep.equal(['011401533', '011401533', '011401533']);
      }),
    );

    it(
      'throws an error when an incorrect token is used',
      replayHttp('plaid/getAuth-failure.json', async () => {
        const token = 'bad-access-token';
        const plaid = new PlaidIntegration(token);
        let errorThrown: Error;

        try {
          await plaid.getAccountsWithAccountAndRouting();
        } catch (err) {
          errorThrown = err;
        }

        expect(errorThrown).to.exist;
        expect(errorThrown.message).to.eq(
          'provided access token is in an invalid format. expected format: access-<environment>-<identifier>',
        );
      }),
    );

    it(
      'throws an error when login is required',
      replayHttp('plaid/getAuth-login-required.json', async () => {
        const token = 'login-required-access-token';
        const plaid = new PlaidIntegration(token);
        let errorThrown: BankingDataSourceError;

        try {
          await plaid.getAccountsWithAccountAndRouting();
        } catch (err) {
          errorThrown = err;
        }

        expect(errorThrown).to.exist;
        expect(errorThrown.errorType).to.eq(BankingDataSourceErrorType.UserInteractionRequired);
        expect(errorThrown.errorCode).to.eq(PlaidErrorCode.ItemLoginRequired);
        expect(errorThrown.message).to.eq(
          "the login details of this item have changed (credentials, MFA, or required user action) and a user login is required to update this information. use Link's update mode to restore the item to a good state",
        );
      }),
    );
  });

  describe('getTransactions', () => {
    const token3 = 'access-sandbox-1fbf327f-6bf1-423d-b966-425d420d0fa2';
    it(
      'returns an array of transactions',
      replayHttp('plaid/getTransactions-success-token3.json', async () => {
        const startDate = '2019-03-18';
        const endDate = '2019-03-19';
        const options = { pageNumber: 0, perPage: 2 };
        const accountId = 'Z5qdlz6kPgFDRx1RzD6MuLdW6PxjKACg6JwQm';
        const plaid = new PlaidIntegration(token3);
        const result = await plaid.getTransactions(startDate, endDate, [accountId], options);
        expect(result.length).to.eq(3);
        expect(result[0].externalId).to.eq('mk5r1376mLHypKBpNyJ3IDGx4oEMn9CLaGeww');
        expect(result[0].pendingExternalId).to.eq(null);
        expect(result[0].bankAccountExternalId).to.eq(accountId);
        expect(result[0].externalName).to.eq("McDonald's");
        expect(result[0].address).to.eq(null);
        expect(result[0].plaidCategory).to.deep.eq(['Food and Drink', 'Restaurants']);
        expect(result[0].amount).to.eq(-12);
        expect(result[0].pending).to.eq(false);
        expect(result[0].plaidCategoryId).to.eq('13005000');
        expect(result[0].referenceNumber).to.eq(null);
      }),
    );

    it(
      'throws an error when incorrect date params are passed',
      replayHttp('plaid/getTransactions-failure-token3.json', async () => {
        const startDate = '2020-04-20'; // the Future
        const endDate = '2019-04-21';
        const accountId = 'Z5qdlz6kPgFDRx1RzD6MuLdW6PxjKACg6JwQm';
        const options = { pageNumber: 0, perPage: 2 };
        const plaid = new PlaidIntegration(token3);

        try {
          await plaid.getTransactions(startDate, endDate, [accountId], options);
          throw Error('error not thrown');
        } catch (e) {
          expect(e.bankingDataSource).to.eq(BankingDataSource.Plaid);
          expect(e.errorCode).to.eq(PlaidErrorCode.InvalidField);
          expect(e.errorType).to.eq(BankingDataSourceErrorType.InvalidRequest);
          expect(e.httpCode).to.eq(400);
        }
      }),
    );

    it(
      'throws an error when incorrect count params are passed',
      replayHttp('plaid/getTransactions-failure-2-token3.json', async () => {
        const startDate = '2019-01-01';
        const endDate = '2019-02-01';
        const accountId = 'Z5qdlz6kPgFDRx1RzD6MuLdW6PxjKACg6JwQm';
        const options = { pageNumber: 0, perPage: -2 };
        const token = 'access-sandbox-01f630cc-e08f-4d89-9021-26a1577abcdf';
        const plaid = new PlaidIntegration(token);

        try {
          await plaid.getTransactions(startDate, endDate, [accountId], options);
          throw Error('error not thrown');
        } catch (e) {
          expect(e.bankingDataSource).to.eq(BankingDataSource.Plaid);
          expect(e.errorCode).to.eq(PlaidErrorCode.InvalidField);
          expect(e.errorType).to.eq(BankingDataSourceErrorType.InvalidRequest);
          expect(e.httpCode).to.eq(400);
        }
      }),
    );

    it(
      'throws an error when incorrect accountId params are passed',
      replayHttp('plaid/getTransactions-failure-3-token3.json', async () => {
        const startDate = '2019-03-18';
        const endDate = '2019-03-19';
        const accountId = 'ellierulez';
        const options = { pageNumber: 0, perPage: 2 };
        const plaid = new PlaidIntegration(token3);

        try {
          await plaid.getTransactions(startDate, endDate, [accountId], options);
          throw Error('error not thrown');
        } catch (e) {
          expect(e.bankingDataSource).to.eq(BankingDataSource.Plaid);
          expect(e.errorCode).to.eq(PlaidErrorCode.InvalidField);
          expect(e.errorType).to.eq(BankingDataSourceErrorType.InvalidRequest);
          expect(e.httpCode).to.eq(400);
        }
      }),
    );
  });

  describe('deleteNexus', () => {
    it(
      'returns a boolean',
      replayHttp('plaid/deleteNexus-success.json', async () => {
        const token = 'access-sandbox-01f630cc-e08f-4d89-9021-26a1577abcdf';
        const plaid = new PlaidIntegration(token);
        const response = await plaid.deleteNexus();
        expect(response).to.eq(true);
      }),
    );
  });

  describe('getNexus', () => {
    it(
      'should return the institution and external id',
      replayHttp('plaid/getNexus-success.json', async () => {
        const token = 'access-sandbox-01f630cc-e08f-4d89-9021-26a1577abcdf';
        const plaid = new PlaidIntegration(token);
        const nexus = await plaid.getNexus();
        expect(nexus).to.deep.equal({
          externalId: 'PnNw6XRlyKUrMeVMmVGqukr8xPDgLai7kLzKX',
          authToken: token,
          externalInstitutionId: 'ins_13',
        });
      }),
    );
  });
});
