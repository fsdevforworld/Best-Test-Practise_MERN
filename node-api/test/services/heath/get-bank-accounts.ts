import factory from '../../factories';
import app from '../../../src/services/heath';
import * as sinon from 'sinon';
import * as request from 'supertest';
import { BankAccount } from '../../../src/models';
import { expect } from 'chai';

describe('Get Bank Accounts', () => {
  const sandbox = sinon.createSandbox();
  afterEach(() => {
    sandbox.restore();
  });
  describe('By Id', () => {
    const GET_ROUTE = (bankAccountId: number) =>
      `/services/banking-data/bank-account/${bankAccountId}`;
    it('should return a bank account if exists', async () => {
      const ba = await factory.create<BankAccount>('bank-account');
      const bankConnection = await ba.getBankConnection();
      const { body } = await request(app)
        .get(GET_ROUTE(ba.id))
        .expect(200);

      expect(body).to.deep.eq({
        id: ba.id,
        bankConnectionId: ba.bankConnectionId,
        current: ba.current,
        isDaveBanking: bankConnection.isDaveBanking(),
        microDepositComplete: ba.microDepositComplete(),
        hasValidCredentials: bankConnection.hasValidCredentials,
        initialPull: bankConnection.initialPull.format(),
        mainPaycheckRecurringTransactionId: ba.mainPaycheckRecurringTransactionId,
      });
    });

    it('should throw a not found error if bank account does not exist', async () => {
      await request(app)
        .get(GET_ROUTE(123456))
        .expect(404);
    });
  });

  describe('All Primary Accounts', () => {
    const GET_PRIMARY_ROUTE = (userId: number) =>
      `/services/banking-data/user/${userId}/primary-bank-accounts`;
    it('should get a primary bank account if exists', async () => {
      const ba = await factory.create<BankAccount>('bank-account');
      const bankConnection = await ba.getBankConnection();
      await bankConnection.update({ primaryBankAccountId: ba.id });
      const { body } = await request(app)
        .get(GET_PRIMARY_ROUTE(ba.userId))
        .expect(200);

      expect(body).to.deep.eq([
        {
          id: ba.id,
          bankConnectionId: ba.bankConnectionId,
          current: ba.current,
          isDaveBanking: bankConnection.isDaveBanking(),
          microDepositComplete: ba.microDepositComplete(),
          hasValidCredentials: bankConnection.hasValidCredentials,
          initialPull: bankConnection.initialPull.format(),
          mainPaycheckRecurringTransactionId: ba.mainPaycheckRecurringTransactionId,
        },
      ]);
    });

    it('should return multiple bank accounts if user has a bod account', async () => {
      const ba = await factory.create<BankAccount>('bank-account');
      const bankConnection = await ba.getBankConnection();
      await bankConnection.update({ primaryBankAccountId: ba.id });

      const bodAccount = await factory.create('bod-checking-account', { userId: ba.userId });
      const bodConnection = await bodAccount.getBankConnection();
      await bodConnection.update({
        primaryBankAccountId: bodAccount.id,
        userId: bodAccount.userId,
      });

      const { body } = await request(app)
        .get(GET_PRIMARY_ROUTE(ba.userId))
        .expect(200);

      expect(body.length).to.eq(2);
    });

    it('should throw a not found error if user has no accounts', async () => {
      await request(app)
        .get(GET_PRIMARY_ROUTE(123456))
        .expect(404);
    });
  });
});
