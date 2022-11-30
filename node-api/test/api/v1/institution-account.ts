import * as request from 'supertest';
import PubSub from '../../../src/lib/pubsub';
import * as plaid from 'plaid';
import gcloudKms from '../../../src/lib/gcloud-kms';
import plaidClient from '../../../src/lib/plaid';
import * as sinon from 'sinon';
import * as Bluebird from 'bluebird';
import sendgrid from '../../../src/lib/sendgrid';
import twilio from '../../../src/lib/twilio';
import app from '../../../src/api';

import fixtures from '../../fixtures';

import { BankConnection, User } from '../../../src/models';
import { BankConnectionUpdate } from '../../../src/models/warehouse';
import * as BankingDataSync from '../../../src/domain/banking-data-sync';
import { Metric, metrics } from '../../../src/api/v1/institution-account';
import { expect } from 'chai';
import { clean, stubBankTransactionClient, up } from '../../test-helpers';
import factory from '../../factories';
import {
  BankConnectionUpdateType,
  PlaidItemWebhook,
  PlaidItemWebhookCode,
  PlaidWebhookType,
} from '../../../src/typings';
import redisClient from '../../../src/lib/redis';
import * as Jobs from '../../../src/jobs/data';
import * as md5 from 'md5';

describe('/bank/* endpoints', () => {
  const sandbox = sinon.createSandbox();

  before(() => clean());

  // insert institution fixtures
  beforeEach(async () => {
    sandbox.stub(twilio, 'send').resolves();
    sandbox.stub(sendgrid, 'send').resolves();
    sandbox.stub(BankingDataSync, 'fetchAndSyncBankTransactions').resolves();
    sandbox.stub(Jobs, 'createBroadcastBankDisconnectTask');
    stubBankTransactionClient(sandbox);
    return up(fixtures);
  });

  afterEach(() => clean(sandbox));

  describe('Bank connection webhook', () => {
    it('Should publish an event', async () => {
      const createSpy = sandbox.spy(BankConnectionUpdate, 'create');
      sandbox
        .stub(gcloudKms, 'encrypt')
        .callsFake((val: any) => Bluebird.resolve({ ciphertext: val }));
      sandbox.stub(PubSub, 'publish').resolves();
      sandbox.stub(plaid.Client.prototype, 'removeItem').resolves({});
      sandbox.stub(plaid.Client.prototype, 'getAuth').resolves({
        accounts: [
          {
            account_id: '1',
            mask: '1111',
            name: 'Plaid Account',
            balances: {
              current: 100,
              available: 200,
            },
            type: 'depository',
            subtype: 'checking',
          },
        ],
        numbers: {
          ach: [
            {
              account_id: '1',
              account: '101',
              routing: '12345678',
            },
          ],
        },
      });

      const data = {
        webhook_code: 'INITIAL_UPDATE',
        webhook_type: 'TRANSACTIONS',
        item_id: 'external_1',
      };

      await request(app)
        .post('/v1/bank/plaid_webhook')
        .send(data)
        .expect(200)
        .then(async () => {
          const connection = await BankConnection.getOneByExternalId('external_1');
          expect(connection).to.be.an('object');
        });

      expect(createSpy.callCount).to.eq(1);
      expect(createSpy.firstCall.args[0].type).to.eq('BANK_CONNECTION_INITIAL_UPDATE');
    });

    const disconnectCodes = ['ITEM_LOGIN_REQUIRED', 'INVALID_CREDENTIALS', 'INVALID_MFA'];

    disconnectCodes.forEach(code => {
      it(`handles bank disconnects: ${code}`, async () => {
        const createSpy = sandbox.spy(BankConnectionUpdate, 'create');

        const bankConnection = await factory.create('bank-connection', {
          hasValidCredentials: true,
        });

        const webhookData: PlaidItemWebhook = {
          webhook_type: PlaidWebhookType.Item,
          webhook_code: PlaidItemWebhookCode.Error,
          item_id: bankConnection.externalId,
          error: {
            error_type: 'ITEM_ERROR',
            error_code: code,
            error_message: 'blah',
            display_message: 'foo',
            name: null,
            message: null,
          },
        };

        await request(app)
          .post('/v1/bank/plaid_webhook')
          .send(webhookData)
          .expect(200);

        await bankConnection.reload();

        expect(bankConnection.hasValidCredentials).to.equal(false);
        expect(createSpy.firstCall.args[0].type).to.equal(
          BankConnectionUpdateType.DATA_SOURCE_ERROR,
        );
        expect(createSpy.secondCall.args[0].type).to.equal(BankConnectionUpdateType.DISCONNECTED);
      });
    });

    ['NO_ACCOUNTS', 'ITEM_NOT_SUPPORTED', 'MFA_NOT_SUPPORTED']
      .concat(disconnectCodes)
      .forEach(itemError => {
        it(`saves plaid error: ${itemError} on the bank connection`, async () => {
          const bankConnection = await factory.create('bank-connection', {
            bankingDataSourceErrorCode: null,
            bankingDataSourceErrorAt: null,
          });

          const webhookData: PlaidItemWebhook = {
            webhook_type: PlaidWebhookType.Item,
            webhook_code: PlaidItemWebhookCode.Error,
            item_id: bankConnection.externalId,
            error: {
              error_type: 'ITEM_ERROR',
              error_code: itemError,
              error_message: 'blah',
              display_message: 'foo',
              name: null,
              message: null,
            },
          };

          await request(app)
            .post('/v1/bank/plaid_webhook')
            .send(webhookData)
            .expect(200);

          await bankConnection.reload();

          expect(bankConnection.bankingDataSourceErrorCode).to.equal(itemError);
          expect(bankConnection.bankingDataSourceErrorAt).to.exist;
        });
      });
  });

  describe('Set credentials valid', () => {
    it('marks the bank connection as having valid credentials', async () => {
      await request(app)
        .get('/v1/bank/6/validate')
        .set('Authorization', 'token-5')
        .set('X-Device-Id', 'id-5')
        .expect(200);
      const updatedConnection = await BankConnection.findByPk(6);
      expect(updatedConnection.hasValidCredentials).to.equal(true);
    });

    it('adds a BANK_CONNECTION_RECONNECTED entry in the audit log', async () => {
      const createSpy = sandbox.spy(BankConnectionUpdate, 'create');
      await request(app)
        .get('/v1/bank/6/validate')
        .set('Authorization', 'token-5')
        .set('X-Device-Id', 'id-5')
        .expect(200);
      expect(createSpy.firstCall.args[0].type).to.equal('BANK_CONNECTION_RECONNECTED');
    });
  });

  describe('getToken', () => {
    it('returns early for BoD users and does not call the Plaid endpoint', async () => {
      const metricsSpy = sandbox.spy(metrics, 'increment');
      const connection: BankConnection = await factory.create('bank-of-dave-bank-connection');
      const user: User = await connection.getUser();

      const plaidClientStub = sandbox.stub(plaidClient, 'createPublicToken');

      const { body } = await request(app)
        .get(`/v1/bank/${connection.id}/token`)
        .set('Authorization', `${user.id}`)
        .set('X-Device-Id', `${user.id}`)
        .expect(200);

      sandbox.assert.calledWith(metricsSpy, Metric.notPlaid);
      expect(body).to.equal('');
      expect(plaidClientStub.callCount).to.equal(0);
    });
    it('returns early for MX users and does not call the Plaid endpoint', async () => {
      const metricsSpy = sandbox.spy(metrics, 'increment');
      const connection: BankConnection = await factory.create('mx-bank-connection');
      const user: User = await connection.getUser();

      const plaidClientStub = sandbox.stub(plaidClient, 'createPublicToken');

      const { body } = await request(app)
        .get(`/v1/bank/${connection.id}/token`)
        .set('Authorization', `${user.id}`)
        .set('X-Device-Id', `${user.id}`)
        .expect(200);

      sandbox.assert.calledWith(metricsSpy, Metric.notPlaid);
      expect(body).to.equal('');
      expect(plaidClientStub.callCount).to.equal(0);
    });
    it('throws error if user does not match bank connnection', async () => {
      const metricsSpy = sandbox.spy(metrics, 'increment');
      const connection: BankConnection = await factory.create('mx-bank-connection');
      // create another user, not attached to bank connection
      const user: User = await factory.create('user');
      const plaidClientStub = sandbox.stub(plaidClient, 'createPublicToken');

      await request(app)
        .get(`/v1/bank/${connection.id}/token`)
        .set('Authorization', `${user.id}`)
        .set('X-Device-Id', `${user.id}`)
        .expect(404);

      sandbox.assert.calledWith(metricsSpy, Metric.tokenNotFound);
      expect(plaidClientStub.callCount).to.equal(0);
    });
    it('will cache a plaid token', async () => {
      const token = 'cheese';
      const connection: BankConnection = await factory.create('bank-connection');
      const user: User = await connection.getUser();
      const plaidClientStub = sandbox
        .stub(plaidClient, 'createPublicToken')
        .resolves({ public_token: token });

      const { body } = await request(app)
        .get(`/v1/bank/${connection.id}/token`)
        .set('Authorization', `${user.id}`)
        .set('X-Device-Id', `${user.id}`)
        .expect(200);

      expect(plaidClientStub.callCount).to.equal(1);
      expect(body).to.eq(token);
      const stored = await redisClient.getAsync(`plaid-public-token-${md5(connection.authToken)}`);
      expect(stored).to.eq(token);
    });
    it('will set a timeout when caching a plaid token', async () => {
      const token = 'cheese';
      const connection: BankConnection = await factory.create('bank-connection');
      const user: User = await connection.getUser();
      sandbox.stub(plaidClient, 'createPublicToken').resolves({ public_token: token });
      const cacheStub = sandbox.stub(redisClient, 'setAsync').resolves();

      await request(app)
        .get(`/v1/bank/${connection.id}/token`)
        .set('Authorization', `${user.id}`)
        .set('X-Device-Id', `${user.id}`)
        .expect(200);

      expect(cacheStub.firstCall.args[0][2]).to.eq('EX');
      expect(cacheStub.firstCall.args[0][3]).to.eq((30 * 60).toString());
    });
    it('will return a cached a plaid token if available', async () => {
      const token = 'cheese';
      const connection: BankConnection = await factory.create('bank-connection');
      await redisClient.setAsync(`plaid-public-token-${md5(connection.authToken)}`, token);
      const plaidClientStub = sandbox
        .stub(plaidClient, 'createPublicToken')
        .resolves({ public_token: 'wowee not me' });

      const { body } = await request(app)
        .get(`/v1/bank/${connection.id}/token`)
        .set('Authorization', `${connection.userId}`)
        .set('X-Device-Id', `${connection.userId}`)
        .expect(200);

      expect(plaidClientStub.callCount).to.equal(0);
      expect(body).to.eq(token);
    });
    it('handles Plaid API error gracefully', async () => {
      const metricsSpy = sandbox.spy(metrics, 'increment');
      const connection: BankConnection = await factory.create('plaid-bank-connection');
      const user: User = await connection.getUser();

      const plaidClientStub = sandbox.stub(plaidClient, 'createPublicToken').throws();

      const { body } = await request(app)
        .get(`/v1/bank/${connection.id}/token`)
        .set('Authorization', `${user.id}`)
        .set('X-Device-Id', `${user.id}`)
        .expect(200);

      sandbox.assert.calledWith(metricsSpy, Metric.tokenError);
      expect(body).to.equal('');
      expect(plaidClientStub.callCount).to.equal(1);
    });
  });
});
