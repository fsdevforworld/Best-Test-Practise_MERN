import * as request from 'supertest';
import app from '../../../../src/services/internal-dashboard-api';
import factory from '../../../factories';
import { expect } from 'chai';
import { clean, stubBankTransactionClient, withInternalUser } from '../../../test-helpers';
import { moment } from '@dave-inc/time-lib';
import * as sinon from 'sinon';

describe('/dashboard/bank_transaction/* endpoints', () => {
  const sandbox = sinon.createSandbox();
  before(() => clean());

  beforeEach(() => {
    stubBankTransactionClient(sandbox);
  });

  afterEach(() => clean(sandbox));

  describe('GET /dashboard/user/:userId/bank_transaction', () => {
    it('should get all the recurring transactions for a user', async () => {
      const bankAccount = await factory.create('bank-account');
      const transaction = await factory.create('bank-transaction', {
        transactionDate: moment().subtract(7, 'days'),
        userId: bankAccount.userId,
        bankAccountId: bankAccount.id,
      });

      const req = request(app)
        .get(`/dashboard/user/${transaction.userId}/bank_transaction`)
        .expect(200);
      const result = await withInternalUser(req);

      expect(result.body).to.be.an('array');
      expect(result.body[0].id).to.equal(transaction.id);
      expect(result.body[0].displayName).to.equal(transaction.displayName);
      expect(result.body.length).to.equal(1);
    });
  });
});
