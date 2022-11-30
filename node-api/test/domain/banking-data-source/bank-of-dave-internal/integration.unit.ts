import { moment } from '@dave-inc/time-lib';
import { BankAccountSubtype, BankAccountType, BankingDataSource } from '@dave-inc/wire-typings';
import { expect } from 'chai';
import BankOfDaveInternalApiIntegration from '../../../../src/domain/banking-data-source/bank-of-dave-internal/integration';
import { BankingDataSourceError } from '../../../../src/domain/banking-data-source/error';
import { BankingDataSourceErrorType, DaveBankingErrorCode } from '../../../../src/typings';
import { replayHttp } from '../../../test-helpers';

const daveUserId = 119;
const daveUserUuid = 'pelican-xyz-123';

describe('Bank Of Dave Domain', () => {
  describe('getAccounts', () => {
    it(
      'returns an array of accounts',
      replayHttp('bank-of-dave/internal-api/get-accounts-success.json', async () => {
        const bankOfDave = new BankOfDaveInternalApiIntegration(daveUserId, daveUserUuid);
        const result = await bankOfDave.getAccounts();
        expect(result.length).to.eq(2);

        const [spendingAccount, goalsAccount] = result;

        expect(spendingAccount.bankingDataSource).to.eq(BankingDataSource.BankOfDave);
        expect(spendingAccount.externalId).to.eq('7543e5802b6411eb8507d55f739d8e32');
        expect(spendingAccount.current).to.eq(124.13);
        expect(spendingAccount.available).to.eq(124.13);
        expect(spendingAccount.nickname).to.eq('Pelican Checking');
        expect(spendingAccount.type).to.eq(BankAccountType.Depository);
        expect(spendingAccount.lastFour).to.eq('3927');
        expect(spendingAccount.subtype).to.eq(BankAccountSubtype.Checking);

        expect(goalsAccount.bankingDataSource).to.eq(BankingDataSource.BankOfDave);
        expect(goalsAccount.externalId).to.eq('e50c29006b0511eb964127657bf01167');
        expect(goalsAccount.current).to.eq(25.16);
        expect(goalsAccount.available).to.eq(25.16);
        expect(goalsAccount.nickname).to.eq('Pelican Goals');
        expect(goalsAccount.type).to.eq(BankAccountType.Depository);
        expect(goalsAccount.lastFour).to.eq('3928');
        expect(goalsAccount.subtype).to.eq(BankAccountSubtype.Savings);
      }),
    );

    it(
      'throws an error when the account is not found',
      replayHttp('bank-of-dave/internal-api/get-accounts-not-found.json', async () => {
        const bankOfDave = new BankOfDaveInternalApiIntegration(daveUserId, daveUserUuid);

        try {
          await bankOfDave.getAccounts();
          throw Error('error not thrown');
        } catch (e) {
          expect(e.bankingDataSource).to.eq(BankingDataSource.BankOfDave);
          expect(e.errorCode).to.eq(DaveBankingErrorCode.NotFoundError);
          expect(e.errorType).to.eq(BankingDataSourceErrorType.InvalidRequest);
          expect(e.httpCode).to.eq(404);
          expect(e.data).to.deep.eq({});
        }
      }),
    );

    it(
      'throws an error when not authorized',
      replayHttp('bank-of-dave/internal-api/get-accounts-not-authorized.json', async () => {
        const bankOfDave = new BankOfDaveInternalApiIntegration(daveUserId, daveUserUuid);

        let errorThrown: BankingDataSourceError;

        try {
          await bankOfDave.getAccountsWithAccountAndRouting();
        } catch (err) {
          errorThrown = err;
        }

        expect(errorThrown).to.exist;
        expect(errorThrown.errorCode).to.eq(DaveBankingErrorCode.AuthorizationError);
        expect(errorThrown.errorType).to.eq(BankingDataSourceErrorType.InvalidRequest);
        expect(errorThrown.httpCode).to.eq(401);
      }),
    );
  });

  describe('getAccountsWithAccountAndRouting', async () => {
    it(
      'returns all of the bank accounts with a list of account and routing numbers',
      replayHttp('bank-of-dave/internal-api/get-accounts-success.json', async () => {
        const bankOfDave = new BankOfDaveInternalApiIntegration(daveUserId, daveUserUuid);
        const result = await bankOfDave.getAccountsWithAccountAndRouting();
        const lastFours = result.map(r => r.lastFour);
        const accountNumbers = result.map(r => r.account);
        const routingNumbers = result.map(r => r.routing);

        expect(result).length(2);
        expect(lastFours).to.deep.equal(['3927', '3928']);
        expect(accountNumbers).to.deep.equal(['9851183927', '9851183928']);
        expect(routingNumbers).to.deep.equal(['084106768', '084106768']);
      }),
    );

    it(
      'throws an error when account is not found',
      replayHttp('bank-of-dave/internal-api/get-accounts-not-found.json', async () => {
        const bankOfDave = new BankOfDaveInternalApiIntegration(daveUserId, daveUserUuid);

        let errorThrown: BankingDataSourceError;

        try {
          await bankOfDave.getAccountsWithAccountAndRouting();
        } catch (err) {
          errorThrown = err;
        }

        expect(errorThrown).to.exist;
        expect(errorThrown.errorCode).to.eq(DaveBankingErrorCode.NotFoundError);
        expect(errorThrown.errorType).to.eq(BankingDataSourceErrorType.InvalidRequest);
        expect(errorThrown.httpCode).to.eq(404);
      }),
    );

    it(
      'throws an error when not authorized',
      replayHttp('bank-of-dave/internal-api/get-accounts-not-authorized.json', async () => {
        const bankOfDave = new BankOfDaveInternalApiIntegration(daveUserId, daveUserUuid);

        let errorThrown: BankingDataSourceError;

        try {
          await bankOfDave.getAccountsWithAccountAndRouting();
        } catch (err) {
          errorThrown = err;
        }

        expect(errorThrown).to.exist;
        expect(errorThrown.errorCode).to.eq(DaveBankingErrorCode.AuthorizationError);
        expect(errorThrown.errorType).to.eq(BankingDataSourceErrorType.InvalidRequest);
        expect(errorThrown.httpCode).to.eq(401);
      }),
    );
  });

  describe('getBalance', () => {
    it(
      'returns all of the bank accounts with their balance',
      replayHttp('bank-of-dave/internal-api/get-accounts-success.json', async () => {
        const bankOfDave = new BankOfDaveInternalApiIntegration(daveUserId, daveUserUuid);
        const result = await bankOfDave.getBalance();
        expect(result.length).to.eq(2);

        const [spendingAccount, goalsAccount] = result;

        expect(spendingAccount.bankingDataSource).to.eq(BankingDataSource.BankOfDave);
        expect(spendingAccount.externalId).to.eq('7543e5802b6411eb8507d55f739d8e32');
        expect(spendingAccount.current).to.eq(124.13);
        expect(spendingAccount.available).to.eq(124.13);
        expect(spendingAccount.nickname).to.eq('Pelican Checking');
        expect(spendingAccount.type).to.eq(BankAccountType.Depository);
        expect(spendingAccount.lastFour).to.eq('3927');
        expect(spendingAccount.subtype).to.eq(BankAccountSubtype.Checking);

        expect(goalsAccount.bankingDataSource).to.eq(BankingDataSource.BankOfDave);
        expect(goalsAccount.externalId).to.eq('e50c29006b0511eb964127657bf01167');
        expect(goalsAccount.current).to.eq(25.16);
        expect(goalsAccount.available).to.eq(25.16);
        expect(goalsAccount.nickname).to.eq('Pelican Goals');
        expect(goalsAccount.type).to.eq(BankAccountType.Depository);
        expect(goalsAccount.lastFour).to.eq('3928');
        expect(goalsAccount.subtype).to.eq(BankAccountSubtype.Savings);
      }),
    );

    it(
      'returns the balance for a specific account',
      replayHttp('bank-of-dave/internal-api/get-accounts-success.json', async () => {
        const bankOfDave = new BankOfDaveInternalApiIntegration(daveUserId, daveUserUuid);
        const accountId = '7543e5802b6411eb8507d55f739d8e32';
        const result = await bankOfDave.getBalance([accountId]);
        expect(result.length).to.eq(1);

        const [spendingAccount] = result;

        expect(spendingAccount.bankingDataSource).to.eq(BankingDataSource.BankOfDave);
        expect(spendingAccount.externalId).to.eq('7543e5802b6411eb8507d55f739d8e32');
        expect(spendingAccount.current).to.eq(124.13);
        expect(spendingAccount.available).to.eq(124.13);
        expect(spendingAccount.nickname).to.eq('Pelican Checking');
        expect(spendingAccount.type).to.eq(BankAccountType.Depository);
        expect(spendingAccount.lastFour).to.eq('3927');
        expect(spendingAccount.subtype).to.eq(BankAccountSubtype.Checking);
      }),
    );

    it(
      'throws an error when incorrect token is passed',
      replayHttp('bank-of-dave/internal-api/get-accounts-not-found.json', async () => {
        const bankOfDave = new BankOfDaveInternalApiIntegration(daveUserId, daveUserUuid);
        try {
          await bankOfDave.getBalance();
          throw Error('error not thrown');
        } catch (e) {
          expect(e.bankingDataSource).to.eq(BankingDataSource.BankOfDave);
          expect(e.errorCode).to.eq(DaveBankingErrorCode.NotFoundError);
          expect(e.errorType).to.eq(BankingDataSourceErrorType.InvalidRequest);
          expect(e.httpCode).to.eq(404);
          expect(e.data).to.deep.eq({});
        }
      }),
    );
  });

  describe('getTransactions', () => {
    it(
      'keeps fetching until the response has 0 transactions',
      replayHttp('bank-of-dave/internal-api/get-account-transactions-pagination.json', async () => {
        const accountId = '9f79bba2-0725-4667-804c-749d0b68e827';
        const startDate = '2019-11-01';
        const endDate = '2020-03-25';
        const bankOfDave = new BankOfDaveInternalApiIntegration(daveUserId, daveUserUuid);
        const result = await bankOfDave.getTransactions(startDate, endDate, [accountId], {
          perPage: 1,
          pageNumber: 0,
        });
        expect(result.length).to.eq(4);
        expect(result[0].externalId).to.eq('2dee9c11-40f2-4692-8453-85d0f6745982');
        expect(result[0].externalName).to.eq('Dave');
        expect(result[0].bankAccountExternalId).to.eq(accountId);
        expect(result[0].amount).to.eq(10.23);
        expect(result[0].pending).to.eq(true);
        expect(result[0].plaidCategory).to.deep.equal([]);
        expect(result[0].referenceNumber).to.eq('2dee9c11-40f2-4692-8453-85d0f6745982');
        expect(result[0].transactionDate).to.be.sameMoment(moment('2020-03-24'));
        expect(result[2].externalId).to.eq('105ea8f1-a7c0-424a-ad1e-fdcce37a190d');
        expect(result[2].externalName).to.eq('Dave');
        expect(result[2].bankAccountExternalId).to.eq(accountId);
        expect(result[2].amount).to.eq(-0.05);
        expect(result[2].pending).to.eq(false);
        expect(result[2].plaidCategory).to.deep.equal([]);
        expect(result[2].referenceNumber).to.eq('105ea8f1-a7c0-424a-ad1e-fdcce37a190d');
        expect(result[2].transactionDate).to.be.sameMoment(moment('2020-03-24'));
      }),
    );

    it(
      'sets MCC code to plaid_category_id',
      replayHttp('bank-of-dave/internal-api/mcc-code.json', async () => {
        const accountId = '017d777079b611eaa4c25bd905a392a2';
        const startDate = '2020-05-05';
        const endDate = '2020-05-05';
        const bankOfDave = new BankOfDaveInternalApiIntegration(4829, '');
        const result = await bankOfDave.getTransactions(startDate, endDate, [accountId], {
          perPage: 1,
          pageNumber: 0,
        });
        expect(result.length).to.eq(1);
        expect(result[0].plaidCategoryId).to.eq('4190');
      }),
    );

    it(
      'throws an error when bank account id is not found',
      replayHttp(
        'bank-of-dave/internal-api/get-account-transactions-accountid-not-found.json',
        async () => {
          const accountId = 'pelican-rulez';
          const startDate = '2019-03-01';
          const endDate = '2019-03-25';
          const bankOfDave = new BankOfDaveInternalApiIntegration(daveUserId, daveUserUuid);

          try {
            await bankOfDave.getTransactions(startDate, endDate, [accountId], {
              perPage: 1,
              pageNumber: 0,
            });
            throw new Error('error not thrown');
          } catch (e) {
            expect(e.bankingDataSource).to.eq(BankingDataSource.BankOfDave);
            expect(e.errorType).to.eq(BankingDataSourceErrorType.InvalidRequest);
            expect(e.httpCode).to.eq(404);
          }
        },
      ),
    );
  });

  describe('getNexus', () => {
    it('should return the bank of dave institution and use the access token as external id', async () => {
      const bankOfDave = new BankOfDaveInternalApiIntegration(daveUserId, daveUserUuid);
      const nexus = await bankOfDave.getNexus();
      expect(nexus).to.deep.equal({
        externalId: daveUserUuid,
        authToken: daveUserUuid,
        externalInstitutionId: BankingDataSource.BankOfDave,
      });
    });
  });
});
