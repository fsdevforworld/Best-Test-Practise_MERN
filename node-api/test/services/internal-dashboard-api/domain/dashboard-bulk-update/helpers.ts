import * as sinon from 'sinon';
import factory from '../../../../factories';
import { clean } from '../../../../test-helpers';
import { expect } from 'chai';
import { ExternalTransactionStatus } from '@dave-inc/wire-typings';
import { moment } from '@dave-inc/time-lib';
import {
  clearOutstandingBalance,
  createBulkUpdateFraudRulesForUser,
  fetchCurrentOutstandingBalance,
} from '../../../../../src/services/internal-dashboard-api/domain/dashboard-bulk-update/helpers';

describe('Dashboard Bulk Update Helper Functions', () => {
  const sandbox = sinon.createSandbox();

  before(() => clean(sandbox));

  beforeEach(() => clean(sandbox));

  describe('createBulkUpdateFraudRulesForUser', async () => {
    it('generates all 3 rules for a user with a full street address', async () => {
      const user = await factory.create('user', {
        email: 'test@dave.com',
        addressLine1: '1 Main',
        city: 'here',
        state: 'CA',
        zipCode: '90210',
      });
      const errorFraudBlockedUsers = false;
      const result = createBulkUpdateFraudRulesForUser(user, errorFraudBlockedUsers);

      expect(result.length).to.equal(3);
      expect(result[0]).to.have.key('phoneNumber');
      expect(result[1]).to.have.key('email');
      // By elimination the last rule will be the address rule
    });

    it('generates only phone number and email rules for a user without a full street address', async () => {
      const user = await factory.create('user', {
        email: 'test@dave.com',
        addressLine1: null,
        city: 'here',
        state: 'CA',
        zipCode: '90210',
      });
      const errorFraudBlockedUsers = false;
      const result = createBulkUpdateFraudRulesForUser(user, errorFraudBlockedUsers);

      expect(result.length).to.equal(2);
      expect(result[0]).to.have.key('phoneNumber');
      expect(result[1]).to.have.key('email');
    });

    it('generates only phone number rule for a user without a full street address or email', async () => {
      const user = await factory.create('user', {
        email: null,
        addressLine1: null,
        city: 'here',
        state: 'CA',
        zipCode: '90210',
      });
      const errorFraudBlockedUsers = false;
      const result = createBulkUpdateFraudRulesForUser(user, errorFraudBlockedUsers);

      expect(result.length).to.equal(1);
      expect(result[0]).to.have.key('phoneNumber');
    });

    it('generates the phone number and address rules for a user without email', async () => {
      const user = await factory.create('user', {
        email: null,
        addressLine1: '1 Main',
        city: 'here',
        state: 'CA',
        zipCode: '90210',
      });
      const errorFraudBlockedUsers = false;
      const result = createBulkUpdateFraudRulesForUser(user, errorFraudBlockedUsers);

      expect(result.length).to.equal(2);
      expect(result[0]).to.have.key('phoneNumber');
      expect(result[1]).to.not.have.key('email');
      // By elimination the last rule will be the address rule
    });

    it('generates only phone number and email rules for a user without firstName, but with a full street address ', async () => {
      const user = await factory.create('user', {
        firstName: null,
        email: 'test@dave.com',
        addressLine1: '1 Main',
        city: 'here',
        state: 'CA',
        zipCode: '90210',
      });
      const errorFraudBlockedUsers = false;
      const result = createBulkUpdateFraudRulesForUser(user, errorFraudBlockedUsers);

      expect(result.length).to.equal(2);
      expect(result[0]).to.have.key('phoneNumber');
      expect(result[1]).to.have.key('email');
      // By elimination the last rule will be the address rule
    });
  });

  describe('fetchCurrentOutstandingBalance', async () => {
    it('it fetches the correct current balance', async () => {
      const user = await factory.create('user');
      const amount = 50;
      await factory.create('advance', {
        userId: user.id,
        outstanding: amount,
        createdDate: moment()
          .subtract(3, 'days')
          .date(),
      });
      await factory.create('advance', {
        userId: user.id,
        outstanding: amount,
        status: ExternalTransactionStatus.Completed,
      });

      const result = await fetchCurrentOutstandingBalance(user);
      expect(result).to.equal(amount * 2);
    });
  });

  describe('clearOutstandingBalance', async () => {
    it('the balance is cleared', async () => {
      const user = await factory.create('user');
      const internalUser = await factory.create('internal-user', { email: 'test@dave.com' });

      const amount = 50;
      await factory.create('advance', {
        userId: user.id,
        outstanding: amount,
        createdDate: moment()
          .subtract(3, 'days')
          .date(),
      });
      await factory.create('advance', {
        userId: user.id,
        outstanding: amount,
        status: ExternalTransactionStatus.Completed,
      });

      const resultBefore = await fetchCurrentOutstandingBalance(user);

      await clearOutstandingBalance(user, internalUser);

      const resultAfter = await fetchCurrentOutstandingBalance(user);

      expect(resultBefore).to.equal(amount * 2);
      expect(resultAfter).to.equal(0);
    });
  });
});
