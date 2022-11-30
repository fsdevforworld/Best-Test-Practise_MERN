import { expect } from 'chai';
import * as request from 'supertest';
import * as Bluebird from 'bluebird';
import { clean } from '../../test-helpers';
import factory from '../../factories';

import { BankAccount, BankConnection, User } from '../../../src/models';

import app, { BASE_SERVICE_PATH } from '../../../src/services/aether';

describe('Aether Get BankAccount', () => {
  let bankAccount: BankAccount;
  let bankConnection: BankConnection;
  beforeEach(async () => {
    await clean();
    const user = await factory.create<User>('user', {
      firstName: 'Taurean',
      lastName: 'Nader',
      phoneNumber: '+14398241071',
    });
    bankConnection = await factory.create<BankConnection>('bank-connection', {
      userId: user.id,
    });
    bankAccount = await factory.create<BankAccount>('bank-account', {
      userId: user.id,
      bankConnectionId: bankConnection.id,
    });
  });

  afterEach(() => clean());

  describe('Get /bank-account/external/:externalId', () => {
    it('should return the bank account', async () => {
      const response = await request(app).get(
        `${BASE_SERVICE_PATH}/bank-account/external/${bankAccount.externalId}`,
      );

      expect(response.status).to.equal(200);
      const expectedResponse = await Bluebird.props({
        ok: true,
        bankAccount: {
          id: bankAccount.id,
          isDaveBanking: await bankAccount.isDaveBanking(),
          isPrimary: await bankAccount.isPrimaryAccount(),
          isSupported: bankAccount.isSupported(),
          connectionHasValidCredentials: (await bankAccount.getBankConnection())
            ?.hasValidCredentials,
          balances: { available: bankAccount.available, current: bankAccount.current },
        },
      });
      expect(response.body).to.deep.equal(expectedResponse);
    });

    it('should return 404 if a bank acccount does not exist', async () => {
      const response = await request(app).get(`${BASE_SERVICE_PATH}/bank-account/external/foo`);
      expect(response.status).to.equal(404);
    });
  });

  describe('Get /bank-account/external/user/:userId/:externalId', () => {
    it('should return a deleted bank account', async () => {
      const { userId, externalId } = bankAccount;

      await bankConnection.softDelete();

      const response = await request(app).get(
        `${BASE_SERVICE_PATH}/bank-account/external/user/${userId}/${externalId}`,
      );

      expect(response.status).to.equal(200);
      const expectedResponse = await Bluebird.props({
        ok: true,
        bankAccount: {
          id: bankAccount.id,
          isDaveBanking: await bankAccount.isDaveBanking(),
          isPrimary: await bankAccount.isPrimaryAccount(),
          isSupported: bankAccount.isSupported(),
          balances: { available: bankAccount.available, current: bankAccount.current },
        },
      });
      expect(response.body).to.deep.equal(expectedResponse);
    });

    it('should return 404 if a bank acccount does not exist', async () => {
      const response = await request(app).get(
        `${BASE_SERVICE_PATH}/bank-account/external/user/${bankAccount.userId}/foo`,
      );
      expect(response.status).to.equal(404);
    });
  });

  describe('GET /bank-account/:id', () => {
    it("should return false if the user's fraud status is undefined", async () => {
      const response = await request(app).get(
        `${BASE_SERVICE_PATH}/bank-account/${bankAccount.id}`,
      );

      expect(response.status).to.equal(200);
      const expectedResponse = await Bluebird.props({
        ok: true,
        bankAccount: {
          id: bankAccount.id,
          isDaveBanking: await bankAccount.isDaveBanking(),
          isPrimary: await bankAccount.isPrimaryAccount(),
          isSupported: bankAccount.isSupported(),
          connectionHasValidCredentials: (await bankAccount.getBankConnection())
            ?.hasValidCredentials,
          balances: { available: bankAccount.available, current: bankAccount.current },
        },
      });
      expect(response.body).to.deep.equal(expectedResponse);
    });

    it('should return 404 if a bank acccount does not exist', async () => {
      const response = await request(app).get(`${BASE_SERVICE_PATH}/bank-account/123456`);
      expect(response.status).to.equal(404);
    });
  });
});
