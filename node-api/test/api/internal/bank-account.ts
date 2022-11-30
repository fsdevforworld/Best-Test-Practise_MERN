import { MicroDeposit } from '@dave-inc/wire-typings';
import { expect } from 'chai';
import * as sinon from 'sinon';
import * as request from 'supertest';
import app from '../../../src/api';
import * as bankingDataSync from '../../../src/domain/banking-data-sync';
import { BankAccount } from '../../../src/models';
import factory from '../../factories';
import { clean, up } from '../../test-helpers';
import { AUTH_SECRET, CLIENT_ID } from './test-constants';

const sandbox = sinon.createSandbox();

describe('GET /internal/user/:id/bank_account/:bankAccountId', () => {
  const BANK_OF_DAVE_USER_DAVE_ID = 1783460;
  let validBankAccount: BankAccount;
  let validBankAccountNullMicroDeposit: BankAccount;
  let testAccountNumber = '12345';
  let testRoutingNumber = '67890';

  const authHeader = `Basic ${Buffer.from(`${CLIENT_ID}:${AUTH_SECRET}`).toString('base64')}`;

  // insert user and user_session data
  beforeEach(async () => {
    await clean(sandbox);
    await up();
    await factory.create('user', { id: BANK_OF_DAVE_USER_DAVE_ID });

    testAccountNumber = '12345';
    testRoutingNumber = '67890';

    const hashedAccountNumber = BankAccount.hashAccountNumber(testAccountNumber, testRoutingNumber);
    const aes256AccountNumber = await BankAccount.encryptAccountNumber(
      testAccountNumber,
      testRoutingNumber,
    );

    validBankAccount = await factory.create('checking-account', {
      userId: BANK_OF_DAVE_USER_DAVE_ID,
      accountNumber: hashedAccountNumber,
      accountNumberAes256: aes256AccountNumber,
      microDeposit: MicroDeposit.COMPLETED,
    });

    validBankAccountNullMicroDeposit = await factory.create('checking-account', {
      userId: BANK_OF_DAVE_USER_DAVE_ID,
      accountNumber: hashedAccountNumber,
      accountNumberAes256: aes256AccountNumber,
    });
  });

  after(() => clean(sandbox));

  context('when refreshBalance fails', () => {
    beforeEach(() => {
      sandbox
        .stub(bankingDataSync, 'refreshBalance')
        .rejects(new Error('This is my inner error message'));
    });

    it('should respond with a BankingDataSourceRefreshError', async () => {
      const result = await request(app)
        .get(`/internal/user/${BANK_OF_DAVE_USER_DAVE_ID}/bank_account/${validBankAccount.id}`)
        .set('Authorization', authHeader)
        .expect(400);

      expect(result.body.message).to.match(/This is my inner error message/);
      expect(result.body.type).to.equal('bank_data_source_refresh');
    });
  });

  context('when refreshBalance successful', () => {
    const expectedBalance = {
      available: 123,
      current: 456,
    };

    let refreshStub: sinon.SinonStubStatic;
    beforeEach(() => {
      refreshStub = sandbox.stub(bankingDataSync, 'refreshBalance').resolves(expectedBalance);
    });

    it('should return a bank account number and routing when available', async () => {
      const { body } = await request(app)
        .get(`/internal/user/${BANK_OF_DAVE_USER_DAVE_ID}/bank_account/${validBankAccount.id}`)
        .set('Authorization', authHeader)
        .expect(200);

      expect(body.bankAccountId).to.equal(validBankAccount.id.toString());
      expect(body.displayName).to.equal(validBankAccount.displayName);
      expect(body.subtype).to.equal(validBankAccount.subtype);
      expect(body.accountNumber).to.equal(testAccountNumber);
      expect(body.routingNumber).to.equal(testRoutingNumber);
      expect(body.isDaveBanking).to.be.false;
      expect(body.currentBalance).to.equal(expectedBalance.current);
      expect(body.availableBalance).to.equal(expectedBalance.available);
    });

    it('should reject with a 403 if user is not associated with bank account', async () => {
      await request(app)
        .get(`/internal/user/12/bank_account/${validBankAccount.id}`)
        .set('Authorization', authHeader)
        .expect(404);
    });

    it('should reject with a 400 if no account numbers available', async () => {
      const invalidBankAccount = await factory.create('checking-account', {
        userId: BANK_OF_DAVE_USER_DAVE_ID,
        accountNumber: null,
        accountNumberAes256: null,
      });

      await request(app)
        .get(`/internal/user/${BANK_OF_DAVE_USER_DAVE_ID}/bank_account/${invalidBankAccount.id}`)
        .set('Authorization', authHeader)
        .expect(400);
    });

    it('should reject with a 400 when micro deposit required and not complete', async () => {
      const hashedAccountNumber = BankAccount.hashAccountNumber(
        testAccountNumber,
        testRoutingNumber,
      );
      const aes256AccountNumber = await BankAccount.encryptAccountNumber(
        testAccountNumber,
        testRoutingNumber,
      );

      const invalidBankAccount = await factory.create('checking-account', {
        userId: BANK_OF_DAVE_USER_DAVE_ID,
        accountNumber: hashedAccountNumber,
        accountNumberAes256: aes256AccountNumber,
        microDeposit: MicroDeposit.REQUIRED,
      });

      await request(app)
        .get(`/internal/user/${BANK_OF_DAVE_USER_DAVE_ID}/bank_account/${invalidBankAccount.id}`)
        .set('Authorization', authHeader)
        .expect(400);
    });

    it('should not reject when micro deposit field is null', async () => {
      const { body } = await request(app)
        .get(
          `/internal/user/${BANK_OF_DAVE_USER_DAVE_ID}/bank_account/${validBankAccountNullMicroDeposit.id}`,
        )
        .set('Authorization', authHeader)
        .expect(200);

      expect(body.bankAccountId).to.equal(validBankAccountNullMicroDeposit.id.toString());
      expect(body.displayName).to.equal(validBankAccountNullMicroDeposit.displayName);
      expect(body.subtype).to.equal(validBankAccountNullMicroDeposit.subtype);
      expect(body.accountNumber).to.equal(testAccountNumber);
      expect(body.routingNumber).to.equal(testRoutingNumber);
      expect(body.isDaveBanking).to.be.false;
    });

    it('should not attempt to fetch a balance if the skipBalanceFetch is set', async () => {
      for (const skipBalanceFetch of ['true', 'TRUE', 'TrUe']) {
        const { body } = await request(app)
          .get(`/internal/user/${BANK_OF_DAVE_USER_DAVE_ID}/bank_account/${validBankAccount.id}`)
          .query({ skipBalanceFetch })
          .set('Authorization', authHeader)
          .expect(200);

        expect(body.bankAccountId).to.equal(validBankAccount.id.toString());
        expect(body.accountNumber).to.equal(testAccountNumber);
        expect(body.routingNumber).to.equal(testRoutingNumber);
        expect(body.currentBalance).to.be.undefined;
        expect(body.availableBalance).to.be.undefined;

        expect(refreshStub).to.not.be.called;
      }
    });

    it('should attempt to fetch a balance if the skipBalanceFetch is not set a valid value', async () => {
      for (const skipBalanceFetch of ['t', 'false', '1']) {
        const { body } = await request(app)
          .get(`/internal/user/${BANK_OF_DAVE_USER_DAVE_ID}/bank_account/${validBankAccount.id}`)
          .query({ skipBalanceFetch })
          .set('Authorization', authHeader)
          .expect(200);

        expect(body.currentBalance).to.equal(expectedBalance.current);
        expect(body.availableBalance).to.equal(expectedBalance.available);
      }
    });
  });
});
