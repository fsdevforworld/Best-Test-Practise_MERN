import { BankingDataSource } from '@dave-inc/wire-typings';
import { expect } from 'chai';

import { replayHttp } from '../../../test-helpers';

import { BankingDataSourceErrorType, PlaidErrorCode } from '../../../../src/typings';
import PlaidIntegration from '../../../../src/domain/banking-data-source/plaid/integration';

describe('Plaid Domain', () => {
  describe('getBalance', () => {
    it(
      'returns all of the bank accounts with their balance',
      replayHttp('plaid/getBalance-success.json', async () => {
        const token = 'access-sandbox-01f630cc-e08f-4d89-9021-26a1577abcdf';
        const plaid = new PlaidIntegration(token);
        const result = await plaid.getBalance();
        expect(result.length).to.eq(3);
        expect(result[0].available).to.eq(100);
        expect(result[0].current).to.eq(110);
      }),
    );

    it(
      'returns the balance for a specific account',
      replayHttp('plaid/getBalance-other-token-success.json', async () => {
        const otherToken = 'access-sandbox-6ec54ddc-28a3-4d68-b4dd-14593d1bb770';
        const accountId = '1n64o3b71BCLjKXeJ5BNi8xqwX8jqxF5w98qx';
        const plaid = new PlaidIntegration(otherToken);
        const result = await plaid.getBalance([accountId]);
        expect(result.length).to.eq(1);
        expect(result[0].available).to.eq(100);
      }),
    );

    it(
      'throws an error when incorrect token is passed',
      replayHttp('plaid/getBalance-failure.json', async () => {
        const badToken = 'access-sandbox-123';
        const accountId = '123';
        const plaid = new PlaidIntegration(badToken);
        try {
          await plaid.getBalance([accountId]);
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
});
