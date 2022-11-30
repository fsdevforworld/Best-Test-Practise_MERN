import { expect } from 'chai';
import * as config from 'config';
import * as sinon from 'sinon';
import * as request from 'supertest';

import factory from '../../test/factories';

import app from '../../src/services/mx-webhook';
import * as Jobs from '../../src/jobs/data';

import { moment } from '@dave-inc/time-lib';
import pubsub from '../../src/lib/pubsub';

import {
  BankConnectionUpdateType,
  BankingDataSourceErrorType,
  MxAggregationWebhookEventAction,
  MxConnectionStatus,
  MxConnectionStatusWebhookEventAction,
  MxWebhookEventType,
} from '../../src/typings';

import { BankConnection } from '../../src/models';
import { clean } from '../test-helpers';
import { BankConnectionUpdate } from '../../src/models/warehouse';
import { BankingDataSource } from '@dave-inc/wire-typings';
import * as BankingDataSync from '../../src/domain/banking-data-sync';

describe('Mx Webhook Service', () => {
  const sandbox = sinon.createSandbox();

  before(() => clean());
  beforeEach(() => sandbox.stub(Jobs, 'createBroadcastBankDisconnectTask'));
  afterEach(() => clean(sandbox));

  describe('GET /services/mx_webhook/v1/ping', () => {
    it('should successfully respond with a 200', async () => {
      const { body } = await request(app)
        .get('/services/mx_webhook/v1/ping')
        .expect(200);

      expect(body).to.deep.eq({
        ok: true,
      });
    });
  });

  describe('POST /services/mx_webhook/v1', () => {
    const username = config.get<string>('mxAtrium.webhookBasicAuth.username');
    const password = config.get<string>('mxAtrium.webhookBasicAuth.password');
    const base64AuthToken = Buffer.from(`${username}:${password}`, 'utf8').toString('base64');

    describe('Basic Authentication', () => {
      it('should throw an 401 if no no basic authentication credentials were provided', async () => {
        await request(app)
          .post('/services/mx_webhook/v1')
          .expect(401);
      });

      it('should throw an 403 if basic authentication validation fails', async () => {
        const invalidUsername = 'invalid-username';
        const invalidPassword = 'invalid-password';
        const invalidBase64AuthToken = Buffer.from(
          `${invalidUsername}:${invalidPassword}`,
          'utf8',
        ).toString('base64');

        await request(app)
          .post('/services/mx_webhook/v1')
          .set('Authorization', `Basic ${invalidBase64AuthToken}`)
          .expect(403);
      });

      it('should handle the webhook event and respond with a 200', async () => {
        await request(app)
          .post('/services/mx_webhook/v1')
          .set('Authorization', `Basic ${base64AuthToken}`)
          .expect(200);
      });
    });

    describe('Aggregation Webhook Event', () => {
      it('should throw a 400 when bank connection could not be found', async () => {
        const { body } = await request(app)
          .post('/services/mx_webhook/v1')
          .send({
            type: MxWebhookEventType.Aggregation,
            action: MxAggregationWebhookEventAction.MemberDataUpdated,
            user_guid: 'invalid-user-guid',
            member_guid: 'invalid-member-guid',
            transactions_created_count: 41,
            transaction_updated_count: 41,
            completed_at: 1570143001,
            completed_on: '2019-10-03',
          })
          .set('Authorization', `Basic ${base64AuthToken}`)
          .expect(400);

        expect(body.type).to.eq('invalid_parameters');
        expect(body.message).to.include(
          `Could not find bank connection with external id: invalid-member-guid`,
        );
      });

      it('should throw a 500 when there are unexpected errors', async () => {
        const bankConnection = await factory.create<BankConnection>('mx-bank-connection');

        sandbox
          .stub(BankingDataSync, 'saveAndPublishBankConnectionUpdate')
          .throws(new Error('Everything is down'));

        const { body } = await request(app)
          .post('/services/mx_webhook/v1')
          .send({
            type: MxWebhookEventType.Aggregation,
            action: MxAggregationWebhookEventAction.MemberDataUpdated,
            user_guid: bankConnection.userId,
            member_guid: bankConnection.externalId,
            transactions_created_count: 41,
            transaction_updated_count: 41,
            completed_at: 1570143001,
            completed_on: '2019-10-03',
          })
          .set('Authorization', `Basic ${base64AuthToken}`)
          .expect(500);

        expect(body.type).to.eq('internal_error');
        expect(body.message).to.include('Oops, error! Send us this ID if you need help:');
      });

      [
        {
          initialPull: null,
          expectedHistoricalAndInitial: true,
        },
        {
          initialPull: moment(),
          expectedHistoricalAndInitial: false,
        },
      ].forEach(({ initialPull, expectedHistoricalAndInitial }) => {
        it('should create bank connection update record and publish to bank-connection-updater', async () => {
          const bankConnection = await factory.create<BankConnection>('mx-bank-connection', {
            initialPull,
          });

          const saveAndPublishBankConnectionUpdateSpy = sandbox.spy(
            BankingDataSync,
            'saveAndPublishBankConnectionUpdate',
          );
          const pubsubPublishStub = sandbox.stub(pubsub, 'publish');

          await request(app)
            .post('/services/mx_webhook/v1')
            .send({
              type: MxWebhookEventType.Aggregation,
              action: MxAggregationWebhookEventAction.MemberDataUpdated,
              member_guid: bankConnection.externalId,
            })
            .set('Authorization', `Basic ${base64AuthToken}`)
            .expect(200);

          const updateType = expectedHistoricalAndInitial
            ? BankConnectionUpdateType.INITIAL_UPDATE
            : BankConnectionUpdateType.DEFAULT_UPDATE;
          sinon.assert.calledWith(pubsubPublishStub, 'plaid-update', {
            itemId: bankConnection.externalId,
            historical: expectedHistoricalAndInitial,
            initial: expectedHistoricalAndInitial,
            source: BankingDataSource.Mx,
            updateType,
          });
          sinon.assert.calledWith(
            saveAndPublishBankConnectionUpdateSpy,
            sinon.match({
              id: bankConnection.id,
            }),
          );
        });
      });
    });

    describe('Connection Status Webhook Event', () => {
      it('should throw a 400 when bank connection could not be found', async () => {
        const { body } = await request(app)
          .post('/services/mx_webhook/v1')
          .send({
            type: MxWebhookEventType.ConnectionStatus,
            action: MxConnectionStatusWebhookEventAction.Changed,
            member_guid: 'invalid-member-guid',
            connection_status: MxConnectionStatus.Challenged,
          })
          .set('Authorization', `Basic ${base64AuthToken}`)
          .expect(400);

        expect(body.type).to.eq('invalid_parameters');
        expect(body.message).to.include(
          `Could not find bank connection with external id: invalid-member-guid`,
        );
      });

      it('should throw a 500 when there are unexpected errors', async () => {
        const bankConnection = await factory.create<BankConnection>('mx-bank-connection');

        sandbox
          .stub(BankingDataSync, 'saveBankingDataSourceErrorCode')
          .throws(new Error('Everything is down'));

        const { body } = await request(app)
          .post('/services/mx_webhook/v1')
          .send({
            type: MxWebhookEventType.ConnectionStatus,
            action: MxConnectionStatusWebhookEventAction.Changed,
            member_guid: bankConnection.externalId,
            connection_status: MxConnectionStatus.Challenged,
          })
          .set('Authorization', `Basic ${base64AuthToken}`)
          .expect(500);

        expect(body.type).to.eq('internal_error');
        expect(body.message).to.include('Oops, error! Send us this ID if you need help:');
      });

      [
        {
          connectionStatus: MxConnectionStatus.Connected,
        },
        {
          connectionStatus: MxConnectionStatus.Reconnected,
        },
      ].forEach(({ connectionStatus }) => {
        it('should not update the connection status for MX webhooks', async () => {
          const bankConnection = await factory.create<BankConnection>('mx-bank-connection', {
            hasValidCredentials: false,
            bankingDataSourceErrorCode: 'some-error-code',
            bankingDataSourceErrorAt: moment(),
          });

          const setConnectionStatusAsValidSpy = sandbox.spy(
            BankingDataSync,
            'setConnectionStatusAsValid',
          );
          const createBankConnectionUpdateStub = sandbox.stub(BankConnectionUpdate, 'create');

          await request(app)
            .post('/services/mx_webhook/v1')
            .send({
              type: MxWebhookEventType.ConnectionStatus,
              action: MxConnectionStatusWebhookEventAction.Changed,
              member_guid: bankConnection.externalId,
              connection_status: connectionStatus,
            })
            .set('Authorization', `Basic ${base64AuthToken}`)
            .expect(200);

          sinon.assert.calledWith(
            setConnectionStatusAsValidSpy,
            sinon.match({ id: bankConnection.id }),
            {
              type: 'mx-webhook',
            },
          );
          sinon.assert.notCalled(createBankConnectionUpdateStub);

          await bankConnection.reload();

          expect(bankConnection).to.include({
            hasValidCredentials: false,
            bankingDataSourceErrorCode: null,
            bankingDataSourceErrorAt: null,
          });
        });
      });

      [
        // User interaction required
        {
          connectionStatus: MxConnectionStatus.Prevented,
          expectedErrorType: BankingDataSourceErrorType.UserInteractionRequired,
          disconnect: true,
        },
        {
          connectionStatus: MxConnectionStatus.Denied,
          expectedErrorType: BankingDataSourceErrorType.UserInteractionRequired,
          disconnect: true,
        },
        {
          connectionStatus: MxConnectionStatus.Challenged,
          expectedErrorType: BankingDataSourceErrorType.UserInteractionRequired,
          disconnect: true,
        },
        {
          connectionStatus: MxConnectionStatus.Rejected,
          expectedErrorType: BankingDataSourceErrorType.UserInteractionRequired,
          disconnect: true,
        },
        {
          connectionStatus: MxConnectionStatus.Imported,
          expectedErrorType: BankingDataSourceErrorType.UserInteractionRequired,
          disconnect: true,
        },
        {
          connectionStatus: MxConnectionStatus.Impaired,
          expectedErrorType: BankingDataSourceErrorType.UserInteractionRequired,
          disconnect: true,
        },
        {
          connectionStatus: MxConnectionStatus.Locked,
          expectedErrorType: BankingDataSourceErrorType.UserInteractionRequired,
          disconnect: true,
        },
        {
          connectionStatus: MxConnectionStatus.Impeded,
          expectedErrorType: BankingDataSourceErrorType.UserInteractionRequired,
          disconnect: true,
        },

        // Institution error
        {
          connectionStatus: MxConnectionStatus.Degraded,
          expectedErrorType: BankingDataSourceErrorType.InstitutionError,
          disconnect: false,
        },
        {
          connectionStatus: MxConnectionStatus.Delayed,
          expectedErrorType: BankingDataSourceErrorType.InstitutionError,
          disconnect: false,
        },
        {
          connectionStatus: MxConnectionStatus.Failed,
          expectedErrorType: BankingDataSourceErrorType.InstitutionError,
          disconnect: false,
        },
        {
          connectionStatus: MxConnectionStatus.Disabled,
          expectedErrorType: BankingDataSourceErrorType.InstitutionError,
          disconnect: false,
        },
        {
          connectionStatus: MxConnectionStatus.Expired,
          expectedErrorType: BankingDataSourceErrorType.InstitutionError,
          disconnect: false,
        },

        {
          connectionStatus: MxConnectionStatus.Disconnected,
          expectedErrorType: BankingDataSourceErrorType.Disconnected,
          disconnect: true,
        },
        {
          connectionStatus: MxConnectionStatus.Closed,
          expectedErrorType: BankingDataSourceErrorType.Disconnected,
          disconnect: true,
        },

        // No longer supported
        {
          connectionStatus: MxConnectionStatus.Discontinued,
          expectedErrorType: BankingDataSourceErrorType.NoLongerSupported,
          disconnect: true,
        },

        // No operation
        {
          connectionStatus: MxConnectionStatus.Resumed,
          expectedErrorType: BankingDataSourceErrorType.NoOp,
          disconnect: false,
        },
        {
          connectionStatus: MxConnectionStatus.Updated,
          expectedErrorType: BankingDataSourceErrorType.NoOp,
          disconnect: false,
        },
      ].forEach(({ connectionStatus, expectedErrorType, disconnect }) => {
        it(`should handle connection status ${connectionStatus} and should ${
          !disconnect ? 'NOT ' : ''
        }update bank connection as disconnected`, async () => {
          const bankConnection = await factory.create<BankConnection>('mx-bank-connection', {
            hasValidCredentials: true,
            bankingDataSourceErrorCode: null,
            bankingDataSourceErrorAt: null,
          });

          const saveBankingDataSourceErrorCodeSpy = sandbox.spy(
            BankingDataSync,
            'saveBankingDataSourceErrorCode',
          );
          const createBankConnectionUpdateStub = sandbox.stub(BankConnectionUpdate, 'create');

          await request(app)
            .post('/services/mx_webhook/v1')
            .send({
              type: MxWebhookEventType.ConnectionStatus,
              action: MxConnectionStatusWebhookEventAction.Changed,
              member_guid: bankConnection.externalId,
              connection_status: connectionStatus,
            })
            .set('Authorization', `Basic ${base64AuthToken}`)
            .expect(200);

          sinon.assert.calledWith(
            saveBankingDataSourceErrorCodeSpy,
            sinon.match({ id: bankConnection.id }),
            sinon.match({
              errorType: expectedErrorType,
              bankingDataSource: BankingDataSource.Mx,
            }),
          );
          sinon.assert.calledWith(
            createBankConnectionUpdateStub,
            sinon.match({
              userId: bankConnection.userId,
              bankConnectionId: bankConnection.id,
              type: BankConnectionUpdateType.DATA_SOURCE_ERROR,
            }),
          );

          await bankConnection.reload();

          expect(bankConnection).to.include({
            hasValidCredentials: !disconnect,
            bankingDataSourceErrorCode: connectionStatus,
          });
          expect(bankConnection.bankingDataSourceErrorAt).to.exist;
        });
      });
    });
  });
});
