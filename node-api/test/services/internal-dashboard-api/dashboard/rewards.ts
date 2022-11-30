import { expect } from 'chai';
import * as request from 'supertest';
import { moment } from '@dave-inc/time-lib';
import app from '../../../../src/services/internal-dashboard-api';
import { clean, withInternalUser } from '../../../test-helpers';
import factory from '../../../factories';

async function createDaveRewardsUser({
  email,
  phoneNumber,
  firstName,
  lastName,
  paymentMethodProperties = {},
  empyrUserId,
}: {
  email: string;
  phoneNumber: string;
  firstName: string;
  lastName: string;
  paymentMethodProperties?: object;
  empyrUserId: number;
}) {
  const phone = phoneNumber.replace(/\+/, '');
  const synapsepayId = '5a7e272b77c19b' + phone;
  const synapseNodeId = '5a9076344fc164' + phone;

  const user = await factory.create('user', {
    email,
    phoneNumber,
    synapsepayId,
    firstName,
    lastName,
    empyrUserId,
  });
  const userId = user.id;

  const bankConnection = await factory.create('bank-connection', {
    userId,
    hasValidCredentials: true,
    hasTransactions: true,
  });

  const bankAccount = await factory.create('checking-account', {
    userId,
    institutionId: bankConnection.institutionId,
    bankConnectionId: bankConnection.id,
    current: 1400,
    available: 1400,
    synapseNodeId,
  });
  const bankAccountId = bankAccount.id;

  await factory.create('payment-method', {
    bankAccountId,
    userId,
    ...paymentMethodProperties,
  });

  return userId;
}

describe('/dashboard/rewards/* endpoints', () => {
  before(() => clean());
  afterEach(() => clean());

  const expirationForTest = moment()
    .add(1, 'year')
    .format('YYYY-MM-DD');

  describe('GET /dashboard/rewards/:userId', () => {
    it('should return the rewards information for a user who is opted in but has not linked their card', async () => {
      const userId = await createDaveRewardsUser({
        email: 'dave-rewards-user-1@dave.com',
        phoneNumber: '+11112223333',
        firstName: 'Dave',
        lastName: 'Rewards with no linked card',
        paymentMethodProperties: {
          optedIntoDaveRewards: 1,
          empyrCardId: null,
          mask: 1234,
          expiration: expirationForTest,
          scheme: 'visa',
        },
        empyrUserId: 12345,
      });

      const result = await withInternalUser(request(app).get(`/dashboard/rewards/${userId}`));

      expect(result.status).to.equal(200);

      expect(result.body).to.eql({
        empyrUserId: 12345,
        optedInCards: [
          {
            empyrCardId: null,
            expiration: moment(expirationForTest).toISOString(),
            scheme: 'visa',
            mask: '1234',
          },
        ],
      });
    });

    it('should return the rewards information for a user who is opted in and linked their card', async () => {
      const userId = await createDaveRewardsUser({
        email: 'dave-rewards-user-2@dave.com',
        phoneNumber: '+11112223334',
        firstName: 'Dave',
        lastName: 'Rewards with linked card',
        paymentMethodProperties: {
          optedIntoDaveRewards: 1,
          empyrCardId: 77777,
          mask: 5678,
          expiration: expirationForTest,
          scheme: 'mastercard',
        },
        empyrUserId: 12345,
      });

      const result = await withInternalUser(request(app).get(`/dashboard/rewards/${userId}`));

      expect(result.status).to.equal(200);
      expect(result.body).to.eql({
        empyrUserId: 12345,
        optedInCards: [
          {
            empyrCardId: 77777,
            expiration: moment(expirationForTest).toISOString(),
            scheme: 'mastercard',
            mask: '5678',
          },
        ],
      });
    });

    it('should return the rewards information for a user who is not opted in and has not linked their card', async () => {
      const userId = await createDaveRewardsUser({
        email: 'dave-rewards-user-3@dave.com',
        phoneNumber: '+11112223335',
        firstName: 'Dave',
        lastName: 'Rewards who has not opted in',
        paymentMethodProperties: {
          optedIntoDaveRewards: 0,
          empyrCardId: null,
          mask: 1122,
          expiration: expirationForTest,
          scheme: 'other',
        },
        empyrUserId: null,
      });

      const result = await withInternalUser(request(app).get(`/dashboard/rewards/${userId}`));

      expect(result.status).to.equal(200);
      expect(result.body).to.eql({
        empyrUserId: null,
        optedInCards: [],
      });
    });
  });
});
