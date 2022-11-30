import * as request from 'supertest';
import * as sinon from 'sinon';
import { SinonStub } from 'sinon';
import * as BankConnectionHelper from '../../../src/helper/bank-connection';
import app from '../../../src/api';
import { BankConnectionSourceExperiment } from '../../../src/domain/experiment';
import amplitude from '../../../src/lib/amplitude';
import { CUSTOM_ERROR_CODES } from '../../../src/lib/error';
import twilio from '../../../src/lib/twilio';
import plaidClient from '../../../src/lib/plaid';
import gcloudKms from '../../../src/lib/gcloud-kms';
import * as RecurringTransactionDomain from '../../../src/domain/recurring-transaction';
import factory from '../../factories';
import {
  Advance,
  AuditLog,
  BankAccount,
  BankConnection,
  BankConnectionTransition,
  User,
  UserSession,
  Institution,
  PaymentMethod,
} from '../../../src/models';
import { moment, Moment } from '@dave-inc/time-lib';
import accountSchema from '../../schema/bank-account';
import 'mocha';
import { expect } from 'chai';
import { PLAID_WEBHOOK_CODE, PlaidErrorCode, EventTopic } from '../../../src/typings';
import { clean, up, replayHttp } from '../../test-helpers';
import pubsub from '../../../src/lib/pubsub';
import redis from '../../../src/lib/redis';
import * as plaid from '../../../src/lib/plaid';
import 'sinon-chai';
import PlaidTransaction from '../../factories/plaid-transaction';
import * as Appsflyer from '../../../src/lib/appsflyer';
import { BankingDataSource } from '@dave-inc/wire-typings';
import * as BankingDataSync from '../../../src/domain/banking-data-sync';
import stubBankTransactionClient from '../../test-helpers/stub-bank-transaction-client';
import { copyPaymentMethod } from '../../../src/api/v2/bank-connection';

describe('/v2/bank_connection/*', () => {
  const sandbox = sinon.createSandbox();

  // clean everything before we start
  before(() => clean());

  beforeEach(() => {
    stubBankTransactionClient(sandbox);
  });

  afterEach(() => clean(sandbox));

  describe('POST /bank_connection', () => {
    let user: User;

    let exchangePublicTokenStub: SinonStub;
    let deleteStub: SinonStub;
    let getAuthStub: SinonStub;
    let amplitudeTrackStub: SinonStub;
    let plaidClientGetAccountsStub: SinonStub;
    let appsflyerTrackStub: SinonStub;
    let getTransactionsStub: SinonStub;
    let getItemSub: SinonStub;

    const connectionItemId = '123';
    const accounts = [
      {
        account_id: 'act-abc',
        mask: 'mask',
        name: 'name',
        balances: {
          current: 123,
          available: 456,
        },
        type: 'depository',
        subtype: 'checking',
      },
    ];

    const numbers = [{ account_id: 'act-abc', account: '010', routing: '010' }];

    const stubExchangePublicToken = (accessToken: string) => {
      if (exchangePublicTokenStub && exchangePublicTokenStub.restore) {
        exchangePublicTokenStub.restore();
      }
      exchangePublicTokenStub = sandbox
        .stub(plaidClient, 'exchangePublicToken')
        .resolves({ access_token: accessToken, item_id: connectionItemId });
    };

    function stubAuthAndAccounts({ accounts: thisAccounts, numbers: thisNumbers }: any) {
      plaidClientGetAccountsStub.resolves({ accounts: thisAccounts });
      getAuthStub.resolves({
        accounts: thisAccounts,
        numbers: { ach: thisNumbers },
      });
    }

    // insert user and user_session data
    beforeEach(async () => {
      await up();

      appsflyerTrackStub = sandbox.stub(Appsflyer, 'logAppsflyerEvent').resolves();
      sandbox.stub(RecurringTransactionDomain, 'getExpectedTransactionsByAccountId').resolves([]);
      sandbox.stub(twilio, 'send').resolves();
      sandbox.stub(BankingDataSync, 'fetchAndSyncBankTransactions').resolves();
      user = await factory.create('user');

      stubExchangePublicToken('DONKEY_KONG');

      deleteStub = sandbox.stub(plaidClient, 'removeItem').resolves({ removed: true });

      plaidClientGetAccountsStub = sandbox.stub(plaidClient, 'getAccounts').resolves({ accounts });
      amplitudeTrackStub = sandbox.stub(amplitude, 'track').resolves();
      getItemSub = sandbox
        .stub(plaidClient, 'getItem')
        .resolves({ item: { item_id: connectionItemId } });
      getTransactionsStub = sandbox
        .stub(plaidClient, 'getTransactions')
        .resolves({ transactions: [], total_transactions: 0 });
      sandbox
        .stub(plaidClient, 'createPublicToken')
        .resolves({ public_token: 'ratatat', item_id: connectionItemId });
      sandbox.stub(gcloudKms, 'encrypt').resolves({ ciphertext: '001|001' });

      getAuthStub = sandbox.stub(plaidClient, 'getAuth');

      stubAuthAndAccounts({ accounts, numbers });
    });

    //truncate user and user_session data
    afterEach(() => clean(sandbox));

    it('should fail if the institution id or plaid token is not provided', async () => {
      const result = await request(app)
        .post('/v2/bank_connection')
        .send({})
        .set('Authorization', 'token-600')
        .set('X-Device-Id', 'id-600');

      expect(result.status).to.equal(400);
      expect(result.body.message).to.match(/not provided/);
    });

    [PlaidErrorCode.InternalServerError, PlaidErrorCode.InstitutionNotResponding].map(errorCode => {
      context(`when plaid\'s getAuth fails with ${errorCode}`, () => {
        beforeEach(() => {
          getAuthStub.rejects({ error_code: errorCode });
        });

        it('should create a bank connection successfuly with no acc and routing', async () => {
          const result = await request(app)
            .post('/v2/bank_connection')
            .send({ plaidToken: '123', externalInstitutionId: 'wells' })
            .set('Authorization', user.id.toString())
            .set('X-Device-Id', user.id.toString())
            .expect(200);

          expect(result.body[0].hasAccountRouting).to.eq(false);
        });
      });
    });

    context(`when plaid\'s getAuth fails with ${PlaidErrorCode.ItemLoginRequired}`, () => {
      beforeEach(() => {
        getAuthStub.rejects({ error_code: PlaidErrorCode.ItemLoginRequired });
      });

      it('should send an amplitude event if item initially has no auth privilege', async () => {
        const result = await request(app)
          .post('/v2/bank_connection')
          .send({ plaidToken: '123', externalInstitutionId: 'wells' })
          .set('Authorization', user.id.toString())
          .set('X-Device-Id', user.id.toString());

        expect(result.status).to.equal(449);
        expect(result.body.customCode).to.equal(
          CUSTOM_ERROR_CODES.BANK_CONNECTION_DATA_SOURCE_LOGIN_REQUIRED,
        );

        expect(amplitudeTrackStub).to.have.callCount(1);
        expect(amplitudeTrackStub.firstCall.args[0]).to.deep.equal({
          userId: user.id,
          eventType: amplitude.EVENTS.PLAID_AUTH_PERMISSION_REQUESTED,
          eventProperties: {
            source: BankingDataSource.Plaid,
            plaid_institution_id: 'wells',
            institution_display_name: 'Wells',
          },
        });
        expect(appsflyerTrackStub).to.have.callCount(0);
      });
    });

    it('should successfully fallback to microdeposits if the plaid item has no auth accounts', async () => {
      getAuthStub.rejects({ error_code: PlaidErrorCode.NoAuthAccounts });

      const result = await request(app)
        .post('/v2/bank_connection')
        .send({
          plaidToken: '123',
          externalInstitutionId: 'wells',
        })
        .set('Authorization', user.id.toString())
        .set('X-Device-Id', user.id.toString());
      expect(result.status).to.equal(200);
      expect(plaidClientGetAccountsStub).to.have.callCount(1);

      const bankConnections = await BankConnection.findAll({
        include: [BankAccount],
        where: { userId: user.id },
      });
      expect(bankConnections).to.have.lengthOf(1);
      expect(bankConnections[0].authToken).to.equal('DONKEY_KONG');

      expect(bankConnections[0].bankAccounts).to.have.lengthOf(1);
      const bankAccount = bankConnections[0].bankAccounts[0];
      expect(bankAccount.microDeposit).to.be.null;
      expect(bankAccount.accountNumber).to.be.null;
      expect(bankAccount.accountNumberAes256).to.be.null;
      expect(appsflyerTrackStub).to.have.callCount(1);

      const auditLogs = await AuditLog.findAll({ where: { type: 'NO_AUTH_ACCOUNT' } });
      expect(auditLogs).to.have.lengthOf(1);
      const [auditLog] = auditLogs;
      expect(auditLog.extra.institutionName).to.equal('Wells');
      expect(auditLog.extra.plaidInstitutionId).to.equal('wells');
    });

    it('should fail if the user has open advances', async () => {
      await Advance.create({
        userId: 400,
        bankAccountId: 400,
        paymentMethodId: null,
        amount: 300,
        fee: 10,
        outstanding: 310,
        paybackDate: moment(),
        delivery: 'express',
      });
      const result = await request(app)
        .post('/v2/bank_connection')
        .send({
          plaidToken: '123',
          externalInstitutionId: 'wells',
        })
        .set('Authorization', 'token-400')
        .set('X-Device-Id', 'id-400');

      expect(result.status).to.equal(400);
      expect(result.body.message).to.match(
        /Cannot delete a bank connection with outstanding advances/,
      );
    });

    it('should fail and delete the connection if the item has no supported accounts', async () => {
      stubAuthAndAccounts({ accounts: [], numbers: [] });

      const result = await request(app)
        .post('/v2/bank_connection')
        .send({
          plaidToken: '123',
          externalInstitutionId: 'wells',
        })
        .set('Authorization', 'token-600')
        .set('X-Device-Id', 'id-600');

      expect(result.status).to.equal(422);
      expect(result.body.message).to.match(/No supported checking\/prepaid/);
      expect(deleteStub).to.have.callCount(1);
    });

    it('should fail and delete the connection if the account is a duplicate', async () => {
      stubAuthAndAccounts({
        accounts: [
          {
            account_id: 'act-1',
            mask: 'mask',
            name: 'name',
            balances: {
              current: 123,
              available: 456,
            },
            type: 'depository',
            subtype: 'checking',
          },
        ],
        numbers: [{ account_id: 'act-1', account: '001', routing: '001' }],
      });

      const result = await request(app)
        .post('/v2/bank_connection')
        .send({
          plaidToken: '123',
          externalInstitutionId: 'wells',
        })
        .set('Authorization', 'token-600')
        .set('X-Device-Id', 'id-600');

      expect(result.status).to.equal(409);
      expect(result.body.message).to.match(/Duplicate accounts found/);
      expect(deleteStub).to.have.callCount(1);
    });

    it('should succeed if the account is a duplicate and belongs to the same user', async () => {
      exchangePublicTokenStub
        .onFirstCall()
        .resolves({ access_token: 'token' })
        .onSecondCall()
        .resolves({ access_token: 'token2' });
      getItemSub
        .onFirstCall()
        .resolves({ item: { item_id: '123' } })
        .onSecondCall()
        .resolves({ item: { item_id: '1234' } });
      stubAuthAndAccounts({
        accounts: [
          {
            account_id: 'act-abc',
            mask: 'mask',
            name: 'name',
            balances: {
              current: 123,
              available: 456,
            },
            type: 'depository',
            subtype: 'checking',
          },
        ],
        numbers: [{ account_id: 'act-abc', account: 'abc', routing: 'abc' }],
      });
      const result1 = await request(app)
        .post('/v2/bank_connection')
        .send({
          plaidToken: '123',
          externalInstitutionId: 'wells',
        })
        .set('Authorization', user.id.toString())
        .set('X-Device-Id', user.id.toString());

      expect(result1.status).to.equal(200);

      const result2 = await request(app)
        .post('/v2/bank_connection')
        .send({
          plaidToken: '123',
          externalInstitutionId: 'wells',
        })
        .set('Authorization', user.id.toString())
        .set('X-Device-Id', user.id.toString());

      expect(result2.status).to.equal(200);

      const bankConnections = await BankConnection.findAll({ where: { userId: user.id } });
      expect(bankConnections.length).to.equal(1);

      const bankConnection = await BankConnection.findOne({ where: { userId: user.id } });
      expect(bankConnection.authToken).to.equal('token2');
    });

    it('should fail during request to plaid and audit log request_id', async () => {
      exchangePublicTokenStub.rejects({ request_id: '123456', error_message: 'Invalid token' });

      const url = '/v2/bank_connection';

      await request(app)
        .post(url)
        .send({
          plaidToken: 'foo-bar',
          externalInstitutionId: 'wells',
        })
        .set('Authorization', 'token-600')
        .set('X-Device-Id', 'id-600');

      const [log] = await AuditLog.findAll({ where: { userId: 600 } });

      expect(log.type).to.equal('PLAID_REQUEST_FAILURE');
      expect(log.extra.error.data.request_id).to.exist;
    });

    it('should fail during upsertBankAccounts and delete the connection', async () => {
      getAuthStub.rejects({ request_id: '123456', error_message: 'Invalid token' });

      const url = '/v2/bank_connection';

      await request(app)
        .post(url)
        .send({
          plaidToken: 'foo-bar',
          externalInstitutionId: 'wells',
        })
        .set('Authorization', user.id.toString())
        .set('X-Device-Id', user.id.toString());

      const bankConnections = await BankConnection.findAll({ where: { userId: user.id } });
      expect(bankConnections.length).to.equal(0);
    });

    it('should succeed and remove old connections if some exist', async () => {
      const connection = await BankConnection.create({
        externalId: '12321321',
        authToken: 'access_token',
        userId: 600,
        institutionId: 4,
      });
      stubAuthAndAccounts({
        accounts: [
          {
            account_id: 'act-1',
            mask: 'mask',
            name: 'name',
            balances: {
              current: 123,
              available: 456,
            },
            type: 'depository',
            subtype: 'checking',
          },
        ],
        numbers: [{ account_id: 'act-1', account: '600', routing: '600' }],
      });
      await request(app)
        .post('/v2/bank_connection')
        .send({
          plaidToken: '123',
          externalInstitutionId: 'wells',
        })
        .set('Authorization', 'token-600')
        .set('X-Device-Id', 'id-600')
        .expect(200);

      const oldConnection = await BankConnection.findByPk(connection.id);
      expect(oldConnection).to.equal(null);
    });

    it('should not set last pull by default', async () => {
      const { body } = await request(app)
        .post('/v2/bank_connection')
        .send({
          plaidToken: 'bacon',
          externalInstitutionId: 'wells',
        })
        .set('Authorization', user.id.toString())
        .set('X-Device-Id', user.id.toString());

      const connection = await BankConnection.findByPk(body[0].bankConnectionId);
      expect(connection.lastPull).to.eq(null);
    });

    it('should succeed (institution already exists) and return all the accounts if nothing else fails', async () => {
      const externlBankAccountId = 'act-1';
      const oneWeekAgo = moment()
        .subtract(1, 'week')
        .format('YYYY-MM-DD');
      const twoWeeksAgo = moment()
        .subtract(2, 'week')
        .format('YYYY-MM-DD');
      const threeWeeksAgo = moment()
        .subtract(3, 'week')
        .format('YYYY-MM-DD');
      const transactions = [
        ['Random Transaction 1733164514806', -39.97, `${oneWeekAgo}`, 0],
        ['Random Transaction 1733164514801', -19.97, `${oneWeekAgo}`, 0],
        ['Random Transaction 1733164514682', -77.17, `${twoWeeksAgo}`, 0],
        ['Random Transaction 1733164514688', -116.1, `${twoWeeksAgo}`, 0],
        ['Random Transaction 1733164514690', -170.67, `${twoWeeksAgo}`, 0],
        ['Random Transaction 1733164514705', -365.98, `${threeWeeksAgo}`, 0],
        ['Random Transaction 1733164514706', -49.97, `${threeWeeksAgo}`, 0],
      ];
      //changing amount so that we don't get flagged as duplicate
      const plaidTransactions = transactions.map(t => {
        return PlaidTransaction({
          transaction_id: t[0],
          account_id: externlBankAccountId,
          amount: -t[1] * 1.23,
          date: t[2],
          pending: 0,
          name: `${t[0]} - ${externlBankAccountId}`,
        });
      });

      getTransactionsStub.resolves({
        transactions: plaidTransactions,
        total_transactions: plaidTransactions.length,
      });

      const result = await request(app)
        .post('/v2/bank_connection')
        .send({
          plaidToken: '123',
          externalInstitutionId: 'wells',
        })
        .set('Authorization', 'token-600')
        .set('X-Device-Id', 'id-600');

      expect(result.status).to.equal(200);
      expect(result.body).to.be.jsonSchema(accountSchema);
      expect(result.body.length).to.equal(1);
      const account = result.body[0];
      expect(account.institution.displayName).to.equal('Wells');
    });

    it('should succeed (and insert institution) and return all the accounts if nothing else fails', async () => {
      sandbox.stub(plaidClient, 'getInstitutionById').resolves({
        institution: {
          name: 'New',
          logo: 'logo',
          primary_color: 'fake-color',
          credentials: [
            {
              name: 'username',
              label: 'Username',
              type: 'password',
            },
            {
              name: 'password',
              label: 'Password',
              type: 'password',
            },
          ],
          url: 'fake-url-',
          has_mfa: false,
          institution_id: '123',
          mfa: ['fake'],
          country_codes: ['us'],
          products: ['transactions'],
          oauth: false,
        },
      });

      const result = await request(app)
        .post('/v2/bank_connection')
        .send({
          plaidToken: '123',
          externalInstitutionId: 'new_institution',
        })
        .set('Authorization', user.id.toString())
        .set('X-Device-Id', user.id.toString());

      expect(result.status).to.equal(200);
      expect(result.body).to.be.jsonSchema(accountSchema);
      expect(result.body.length).to.equal(1);
      const account = result.body[0];
      expect(account.institution.displayName).to.equal('New');
    });

    it("should succeed and set the user's default account with one account", async () => {
      await request(app)
        .post('/v2/bank_connection')
        .send({
          plaidToken: '123',
          externalInstitutionId: 'wells',
        })
        .set('Authorization', user.id.toString())
        .set('X-Device-Id', user.id.toString())
        .expect(200);

      await user.reload();
      expect(user.defaultBankAccountId).to.not.equal(null);
    });

    it("should succeed and set the user's default account to the selected account", async () => {
      stubAuthAndAccounts({
        accounts: [
          {
            account_id: 'act-abc',
            mask: 'mask',
            name: 'name',
            balances: {
              current: 123,
              available: 456,
            },
            type: 'depository',
            subtype: 'checking',
          },
          {
            account_id: 'act-abc2',
            mask: 'mask',
            name: 'name',
            balances: {
              current: 123,
              available: 456,
            },
            type: 'depository',
            subtype: 'checking',
          },
        ],
        numbers: [
          { account_id: 'act-abc', account: '010', routing: '010' },
          { account_id: 'act-abc2', account: '011', routing: '011' },
        ],
      });

      await request(app)
        .post('/v2/bank_connection')
        .send({
          plaidToken: '123',
          externalInstitutionId: 'wells',
          selectedAccountExternalId: 'act-abc2',
        })
        .set('Authorization', user.id.toString())
        .set('X-Device-Id', user.id.toString())
        .expect(200);

      await user.reload();
      const defaultAccount = user.getDefaultBankAccount();
      expect((await defaultAccount).externalId).to.equal('act-abc2');
    });

    it("should not set the user's default account if no selected account", async () => {
      stubAuthAndAccounts({
        accounts: [
          {
            account_id: 'act-abc',
            mask: 'mask',
            name: 'name',
            balances: {
              current: 123,
              available: 456,
            },
            type: 'depository',
            subtype: 'checking',
          },
          {
            account_id: 'act-abc2',
            mask: 'mask',
            name: 'name',
            balances: {
              current: 123,
              available: 456,
            },
            type: 'depository',
            subtype: 'checking',
          },
        ],
        numbers: [
          { account_id: 'act-abc', account: '010', routing: '010' },
          { account_id: 'act-abc2', account: '011', routing: '011' },
        ],
      });

      await request(app)
        .post('/v2/bank_connection')
        .send({
          plaidToken: '123',
          externalInstitutionId: 'wells',
        })
        .set('Authorization', user.id.toString())
        .set('X-Device-Id', user.id.toString())
        .expect(200);

      await user.reload();
      const defaultAccount = await user.getDefaultBankAccount();
      expect(defaultAccount).to.be.null;
    });

    it('should succeed and run any backed up webhooks', async () => {
      const pubStub = sandbox.stub(pubsub, 'publish');
      pubStub.resolves();

      await redis.lpushAsync(
        `bank-connection-update-${connectionItemId}`,
        JSON.stringify({ itemId: connectionItemId, code: PLAID_WEBHOOK_CODE.HISTORICAL_UPDATE }),
      );

      await request(app)
        .post('/v2/bank_connection')
        .send({
          plaidToken: '123',
          externalInstitutionId: 'wells',
        })
        .set('Authorization', user.id.toString())
        .set('X-Device-Id', user.id.toString())
        .expect(200);

      expect(pubStub.callCount).to.equal(4);
      expect(pubStub.firstCall.args[0]).to.eq('record-created');
      expect(pubStub.secondCall.args[0]).to.eq('record-created');
      expect(pubStub.thirdCall.args[0]).to.eq('record-created');
      expect(pubStub.getCall(3).args[0]).to.eq(EventTopic.BankConnectionInitialUpdate);
    });

    it("should succeed and not set the user's default account with two accounts", async () => {
      stubAuthAndAccounts({
        accounts: [
          {
            account_id: 'act-1',
            mask: 'mask',
            name: 'name',
            balances: {
              current: 123,
              available: 456,
            },
            type: 'depository',
            subtype: 'checking',
          },
          {
            account_id: 'act-2',
            mask: 'mask',
            name: 'name',
            balances: {
              current: 456,
              available: 789,
            },
            type: 'depository',
            subtype: 'checking',
          },
        ],
        numbers: [
          { account_id: 'act-1', account: '600', routing: '600' },
          { account_id: 'act-2', account: '601', routing: '601' },
        ],
      });
      await request(app)
        .post('/v2/bank_connection')
        .send({
          plaidToken: '123',
          externalInstitutionId: 'wells',
        })
        .set('Authorization', 'token-600')
        .set('X-Device-Id', 'id-600')
        .expect(200);
      const thisUser = await User.findByPk(600);
      expect(thisUser.defaultBankAccountId).to.equal(null);
    });

    it('should fail if the user has another account that has outstanding advance', async () => {
      const result = await request(app)
        .post('/v2/bank_connection')
        .send({
          plaidToken: '123',
          externalInstitutionId: 'wells',
        })
        .set('Authorization', 'token-5')
        .set('X-Device-Id', 'id-5');

      expect(result.status).to.equal(400);
    });

    it('successfully creates new plaid connection for a dave banking member', async () => {
      const bankConnection = await factory.create('bank-connection', {
        bankingDataSource: BankingDataSource.BankOfDave,
      });

      const session = await factory.create('user-session', { userId: bankConnection.userId });

      await request(app)
        .post('/v2/bank_connection')
        .send({
          plaidToken: '123',
          externalInstitutionId: 'wells',
        })
        .set('Authorization', session.token)
        .set('X-Device-Id', session.deviceId)
        .expect(200);
    });
  });

  describe('copyPaymentMethod', () => {
    let yesterday: Moment;
    let chaseIns: Institution;
    let chaseOauthIns: Institution;
    let nonChaseOauthIns: Institution;

    beforeEach(async () => {
      yesterday = moment().subtract(1, 'day');
      chaseIns = await factory.create('institution', {
        plaidInstitutionId: 'ins_3',
      });
      chaseOauthIns = await factory.create('institution', {
        plaidInstitutionId: 'ins_56',
      });
      nonChaseOauthIns = await factory.create('institution', {
        plaidInstitutionId: 'ins_4',
      });
    });

    it('it should copy payment method for chase oauth if exists for latest chase connection', async () => {
      const bankConnection: BankConnection = await factory.create('bank-connection', {
        id: 1000001,
        institutionId: chaseIns.id,
        deleted: yesterday,
      });

      // old connection it should ignore
      await factory.create('bank-connection', {
        id: 1000000,
        institutionId: chaseIns.id,
        deleted: yesterday,
      });

      const user = await bankConnection.getUser();
      const bankAccount: BankAccount = await factory.create('bank-account', {
        userId: user.id,
        deleted: yesterday,
        bankConnectionId: bankConnection.id,
        lastFour: '9999',
      });
      const paymentMethod: PaymentMethod = await factory.create('payment-method', {
        userId: user.id,
        bankAccountId: bankAccount.id,
        deleted: yesterday,
        risepayId: '31231212',
      });
      await bankAccount.update({ defaultPaymentMethodId: paymentMethod.id });

      const newBankConnection: BankConnection = await factory.create('bank-connection', {
        institutionId: chaseOauthIns.id,
        userId: user.id,
      });
      const newBankAccount: BankAccount = await factory.create('bank-account', {
        userId: user.id,
        bankConnectionId: newBankConnection.id,
        lastFour: '9999',
      });

      await copyPaymentMethod(user.id, newBankConnection, [newBankAccount]);
      const newPaymentMethod = await newBankAccount.getDefaultPaymentMethod();

      expect(newPaymentMethod).to.not.be.null;
      expect(newPaymentMethod.bankAccountId).to.be.equal(newBankAccount.id);
      expect(newPaymentMethod.id).to.not.equal(paymentMethod.id);
      expect(newPaymentMethod.deleted).to.not.equal(paymentMethod.deleted);
      expect(newPaymentMethod.created).to.not.equal(paymentMethod.created);
      expect(newPaymentMethod.updated).to.not.equal(paymentMethod.updated);
      expect(newPaymentMethod.risepayId).to.be.null;
      expect(newPaymentMethod.tabapayId).to.equal(paymentMethod.tabapayId);
    });

    it('it doesnt error for chase oauth if payment method doesnt exist', async () => {
      const bankConnection: BankConnection = await factory.create('bank-connection', {
        institutionId: chaseIns.id,
        deleted: yesterday,
      });
      const user = await bankConnection.getUser();
      await factory.create('bank-account', {
        userId: user.id,
        deleted: yesterday,
        bankConnectionId: bankConnection.id,
        lastFour: '9999',
      });
      const newBankConnection: BankConnection = await factory.create('bank-connection', {
        institutionId: chaseOauthIns.id,
        userId: user.id,
      });
      const newBankAccount: BankAccount = await factory.create('bank-account', {
        userId: user.id,
        bankConnectionId: newBankConnection.id,
        lastFour: '9999',
      });

      await copyPaymentMethod(user.id, newBankConnection, [newBankAccount]);
      const paymentMethod = await newBankAccount.getDefaultPaymentMethod();
      const paymentMethods = await PaymentMethod.findAll({
        where: {
          userId: user.id,
        },
        paranoid: false,
      });

      expect(paymentMethod).to.be.null;
      expect(paymentMethods.length).to.be.equal(0);
    });

    it('it shouldnt copy payment method if not chase', async () => {
      const bankConnection: BankConnection = await factory.create('bank-connection', {
        institutionId: nonChaseOauthIns.id,
        deleted: yesterday,
      });
      const user = await bankConnection.getUser();
      const bankAccount: BankAccount = await factory.create('bank-account', {
        userId: user.id,
        deleted: yesterday,
        bankConnectionId: bankConnection.id,
        lastFour: '9999',
      });
      const paymentMethod: PaymentMethod = await factory.create('payment-method', {
        userId: user.id,
        bankAccountId: bankAccount.id,
        deleted: yesterday,
      });
      await bankAccount.update({ defaultPaymentMethodId: paymentMethod.id });

      const newBankConnection: BankConnection = await factory.create('bank-connection', {
        institutionId: chaseOauthIns.id,
        userId: user.id,
      });
      const newBankAccount: BankAccount = await factory.create('bank-account', {
        userId: user.id,
        bankConnectionId: newBankConnection.id,
        lastFour: '9999',
      });

      await copyPaymentMethod(user.id, newBankConnection, [newBankAccount]);
      const newPaymentMethod = await newBankAccount.getDefaultPaymentMethod();

      expect(newPaymentMethod).to.be.null;
    });

    it('it shouldnt copy payment method for chase oauth if accs dont match', async () => {
      const bankConnection: BankConnection = await factory.create('bank-connection', {
        institutionId: chaseIns.id,
        deleted: yesterday,
      });
      const user = await bankConnection.getUser();
      const bankAccount: BankAccount = await factory.create('bank-account', {
        userId: user.id,
        deleted: yesterday,
        bankConnectionId: bankConnection.id,
        lastFour: '9999',
      });
      const paymentMethod: PaymentMethod = await factory.create('payment-method', {
        userId: user.id,
        bankAccountId: bankAccount.id,
        deleted: yesterday,
      });
      await bankAccount.update({ defaultPaymentMethodId: paymentMethod.id });

      const newBankConnection: BankConnection = await factory.create('bank-connection', {
        institutionId: chaseOauthIns.id,
        userId: user.id,
      });
      const newBankAccount: BankAccount = await factory.create('bank-account', {
        userId: user.id,
        bankConnectionId: newBankConnection.id,
        lastFour: '9998',
      });

      await copyPaymentMethod(user.id, newBankConnection, [newBankAccount]);
      const newPaymentMethod = await newBankAccount.getDefaultPaymentMethod();

      expect(newPaymentMethod).to.be.null;
    });
  });

  describe('GET /bank_connection/:bankConnectionId/transition', () => {
    let bankConnection: BankConnection;
    let response: request.Response;

    before(async () => {
      bankConnection = await factory.create('bank-connection');
      const user = await bankConnection.getUser();
      const fromBankConnection: BankConnection = await factory.create('bank-connection', {
        userId: user.id,
      });
      const toBankConnection: BankConnection = await factory.create('bank-connection', {
        userId: user.id,
      });
      const defaultBankAccount: BankAccount = await factory.create('checking-account', {
        bankConnectionId: bankConnection.id,
        userId: user.id,
      });

      await BankConnectionTransition.create({
        fromBankConnectionId: fromBankConnection.id,
        toBankConnectionId: bankConnection.id,
      });
      await BankConnectionTransition.create({
        fromBankConnectionId: bankConnection.id,
        fromDefaultBankAccountId: defaultBankAccount.id,
        toBankConnectionId: toBankConnection.id,
      });

      response = await request(app)
        .get(`/v2/bank_connection/${bankConnection.id}/transition`)
        .set('Authorization', user.id.toString())
        .set('X-Device-Id', user.id.toString());
    });

    it('should return all transitions for a bank connection', () => {
      expect(response.body).to.have.lengthOf(2);
    });

    it('should return transitions to a bank connection', () => {
      expect(response.body[0].toBankConnectionId).to.equal(bankConnection.id);
    });

    it('should return transitions from a bank connection', () => {
      expect(response.body[1].fromBankConnectionId).to.equal(bankConnection.id);
    });
  });

  describe('POST /v2/bank_connection_session', () => {
    context('Mx banking source', () => {
      beforeEach(() => {
        sandbox.stub(BankConnectionSourceExperiment, 'isUserBucketed').resolves(true);
      });

      it('should generate the bank connect info for a user', async () => {
        const userSession = await factory.create<UserSession>('user-session');
        const user = await userSession.getUser();

        const mxConnectionUrl = 'fake-mx-connection-url';
        sandbox
          .stub(BankConnectionHelper.default, 'generateMxConnectionUrl')
          .withArgs(sinon.match({ id: user.id }))
          .returns(mxConnectionUrl);

        const result = await request(app)
          .post('/v2/bank_connection_session')
          .set('Authorization', userSession.token)
          .set('X-Device-Id', userSession.deviceId)
          .expect(200);

        expect(result.body).to.deep.equal({
          bankingDataSource: BankingDataSource.Mx,
          data: {
            url: mxConnectionUrl,
          },
        });
      });

      it('should generate the mx connection url for a user given optional parameters', async () => {
        const userSession = await factory.create<UserSession>('user-session');
        const user = await userSession.getUser();

        const mxConnectionUrl = 'fake-mx-connection-url';
        sandbox
          .stub(BankConnectionHelper.default, 'generateMxConnectionUrl')
          .withArgs(
            sinon.match({ id: user.id }),
            sinon.match({
              mxInstitutionCode: 'jeff-institution',
            }),
          )
          .returns(mxConnectionUrl);

        const result = await request(app)
          .post('/v2/bank_connection_session')
          .set('Authorization', userSession.token)
          .set('X-Device-Id', userSession.deviceId)
          .send({
            mxInstitutionCode: 'jeff-institution',
          })
          .expect(200);

        expect(result.body).to.deep.equal({
          bankingDataSource: BankingDataSource.Mx,
          data: {
            url: mxConnectionUrl,
          },
        });
      });

      it('should throw a generic error if generating connection url errors out', async () => {
        const userSession = await factory.create<UserSession>('user-session');

        sandbox
          .stub(BankConnectionHelper.default, 'generateMxConnectionUrl')
          .throws(new Error('error'));

        const result = await request(app)
          .post('/v2/bank_connection_session')
          .set('Authorization', userSession.token)
          .set('X-Device-Id', userSession.deviceId)
          .expect(500);

        expect(result.body.message).to.include('Oops, error! Send us this ID if you need help:');
      });
    });

    context('Plaid banking source', () => {
      it('should generate the bank connect info for a user', async () => {
        sandbox.stub(BankConnectionSourceExperiment, 'isUserBucketed').resolves(false);
        const userSession = await factory.create<UserSession>('user-session');
        const user = await userSession.getUser();

        const mxConnectionUrl = 'fake-mx-connection-url';
        sandbox
          .stub(BankConnectionHelper.default, 'generateMxConnectionUrl')
          .withArgs(sinon.match({ id: user.id }))
          .returns(mxConnectionUrl);

        const result = await request(app)
          .post('/v2/bank_connection_session')
          .set('Authorization', userSession.token)
          .set('X-Device-Id', userSession.deviceId)
          .expect(200);

        expect(result.body).to.deep.equal({
          bankingDataSource: BankingDataSource.Plaid,
          data: null,
        });
      });
    });
  });

  describe('POST /v2/user/credentials/mx_connection_info', () => {
    beforeEach(() => {
      sandbox.stub(BankConnectionSourceExperiment, 'isUserBucketed').resolves(true);
    });

    it('should generate the bank connect url for a user', async () => {
      const userSession = await factory.create<UserSession>('user-session');
      const user = await userSession.getUser();

      const mxConnectionUrl = 'fake-mx-connection-url';
      sandbox
        .stub(BankConnectionHelper.default, 'generateMxConnectionUrl')
        .withArgs(sinon.match({ id: user.id }))
        .returns(mxConnectionUrl);

      await request(app)
        .post('/v2/user/credentials/mx_connection_info')
        .set('Authorization', userSession.token)
        .set('X-Device-Id', userSession.deviceId)
        .expect(200);
    });
  });

  describe('POST /v2/bank_connection/link_token', () => {
    const webhook = 'https://staging.trydave.com/v1/bank/plaid_webhook';
    const minAppVersion = '2.51.0';
    it(
      'should return a rux link token',
      replayHttp('lib/plaid/link-token-success.json', async () => {
        const user = await factory.create<User>('user', {
          id: 123,
          phoneNumber: '+14155550123',
          firstName: 'Jeffrey',
          lastName: 'Jeff',
          created: moment('2020-01-01T00:00:00Z'),
        });
        const userSession = await factory.create<UserSession>('user-session', { userId: user.id });

        const { body } = await request(app)
          .post('/v2/bank_connection/link_token')
          .send({ webhook })
          .set('Authorization', userSession.token)
          .set('X-Device-Id', userSession.deviceId)
          .set('X-App-Version', minAppVersion)
          .expect(200);

        expect(body.token).to.match(/^link-sandbox/);
      }),
    );

    it('should return a link token for update mode', async () => {
      const userSession = await factory.create<UserSession>('user-session');
      const user = await userSession.getUser();
      const token = 'link-sandbox-ccb59e69-8061-4c6a-85f5-2c5661820ed2';
      const connection: BankConnection = await factory.create('bank-connection', {
        userId: user.id,
      });

      sandbox.stub(plaid, 'createLinkItemToken').resolves(token);

      const { body } = await request(app)
        .post('/v2/bank_connection/link_token')
        .send({
          connectionId: connection.id,
          webhook,
        })
        .set('Authorization', userSession.token)
        .set('X-Device-Id', userSession.deviceId)
        .set('X-App-Version', minAppVersion)
        .expect(200);

      expect(body).to.deep.equal({ token });
    });

    it('should return error if bank connection not found', async () => {
      const userSession = await factory.create<UserSession>('user-session');
      const invalidBankConnectionId = '123';

      const { body } = await request(app)
        .post('/v2/bank_connection/link_token')
        .send({
          connectionId: invalidBankConnectionId,
          webhook,
        })
        .set('Authorization', userSession.token)
        .set('X-Device-Id', userSession.deviceId)
        .set('X-App-Version', minAppVersion)
        .expect(404);

      expect(body?.data?.createFreshConnection).to.be.false;
    });

    it('should return 400 webhook param not passed', async () => {
      const userSession = await factory.create<UserSession>('user-session');

      await request(app)
        .post('/v2/bank_connection/link_token')
        .set('Authorization', userSession.token)
        .set('X-Device-Id', userSession.deviceId)
        .set('X-App-Version', minAppVersion)
        .expect(400);
    });

    it(
      'should handle invalid access tokens',
      replayHttp(
        'lib/plaid/link-token-invalid.json',
        async () => {
          const user: User = await factory.create('user', {
            id: 9999999,
            phoneNumber: '+14155550123',
            firstName: 'Jeffrey',
            lastName: 'Jeff',
            created: moment('2020-01-01T00:00:00Z'),
          });
          const userSession: UserSession = await factory.create('user-session', {
            userId: user.id,
          });
          const connection: BankConnection = await factory.create('bank-connection', {
            userId: user.id,
            authToken: '8hz0zu4pgck91xcu',
          });

          const { body } = await request(app)
            .post('/v2/bank_connection/link_token')
            .send({
              connectionId: connection.id,
              webhook,
            })
            .set('Authorization', userSession.token)
            .set('X-Device-Id', userSession.deviceId)
            .set('X-App-Version', minAppVersion)
            .expect(400);

          expect(body?.data?.errorCode).to.equal('INVALID_ACCESS_TOKEN');
          expect(body?.data?.createFreshConnection).to.be.true;
          expect(body?.data?.hasOutstandingAdvance).to.be.false;
        },
        { mode: 'record' },
      ),
    );

    it(
      'should handle invalid access tokens with outstanding adv',
      replayHttp('lib/plaid/link-token-invalid.json', async () => {
        const user: User = await factory.create('user', {
          id: 9999999,
          phoneNumber: '+14155550123',
          firstName: 'Jeffrey',
          lastName: 'Jeff',
          created: moment('2020-01-01T00:00:00Z'),
        });
        const userSession: UserSession = await factory.create('user-session', {
          userId: user.id,
        });
        const connection: BankConnection = await factory.create('bank-connection', {
          userId: user.id,
          authToken: '8hz0zu4pgck91xcu',
        });
        const bankAccount = await factory.create('bank-account', {
          bankConnectionId: connection.id,
          userId: user.id,
        });
        await factory.create('advance', {
          userId: user.id,
          outstanding: 10,
          bankAccountId: bankAccount.id,
        });

        const { body } = await request(app)
          .post('/v2/bank_connection/link_token')
          .send({
            connectionId: connection.id,
            webhook,
          })
          .set('Authorization', userSession.token)
          .set('X-Device-Id', userSession.deviceId)
          .set('X-App-Version', minAppVersion)
          .expect(400);

        expect(body?.data?.errorCode).to.equal('INVALID_ACCESS_TOKEN');
        expect(body?.data?.createFreshConnection).to.be.true;
        expect(body?.data?.hasOutstandingAdvance).to.be.true;
      }),
    );

    it(
      'should handle invalid access tokens without outstanding adv',
      replayHttp('lib/plaid/link-token-invalid.json', async () => {
        const user: User = await factory.create('user', {
          id: 9999999,
          phoneNumber: '+14155550123',
          firstName: 'Jeffrey',
          lastName: 'Jeff',
          created: moment('2020-01-01T00:00:00Z'),
        });
        const userSession: UserSession = await factory.create('user-session', {
          userId: user.id,
        });
        const connection: BankConnection = await factory.create('bank-connection', {
          userId: user.id,
          authToken: '8hz0zu4pgck91xcu',
        });
        const bankAccount = await factory.create('bank-account', {
          bankConnectionId: connection.id,
          userId: user.id,
        });
        await factory.create('advance', {
          userId: user.id,
          outstanding: 0,
          bankAccountId: bankAccount.id,
        });

        const { body } = await request(app)
          .post('/v2/bank_connection/link_token')
          .send({
            connectionId: connection.id,
            webhook,
          })
          .set('Authorization', userSession.token)
          .set('X-Device-Id', userSession.deviceId)
          .set('X-App-Version', minAppVersion)
          .expect(400);

        expect(body?.data?.errorCode).to.equal('INVALID_ACCESS_TOKEN');
        expect(body?.data?.createFreshConnection).to.be.true;
        expect(body?.data?.hasOutstandingAdvance).to.be.false;
      }),
    );

    it('should force app update for ver < 2.24.0 if connectionId is passed for ins_3 (Chase)', async () => {
      const appVersion = '2.23.0';
      const institution: Institution = await factory.create('institution', {
        plaidInstitutionId: 'ins_3',
      });
      const userSession: UserSession = await factory.create('user-session');
      const connection: BankConnection = await factory.create('bank-connection', {
        institutionId: institution.id,
        userId: userSession.userId,
      });

      const { body } = await request(app)
        .post('/v2/bank_connection/link_token')
        .send({
          connectionId: connection.id,
          webhook,
        })
        .set('Authorization', userSession.token)
        .set('X-Device-Id', userSession.deviceId)
        .set('X-App-Version', appVersion)
        .expect(400);

      expect(body?.message).to.include('Please update to the latest version of Dave');
      expect(body?.customCode).to.be.equal(1000);
    });

    it('should allow new connection for ver >= 2.51.0 if connectionId is passed for ins_3 (Chase)', async () => {
      const institution: Institution = await factory.create('institution', {
        plaidInstitutionId: 'ins_3',
      });
      const userSession: UserSession = await factory.create('user-session');
      const connection: BankConnection = await factory.create('bank-connection', {
        institutionId: institution.id,
        userId: userSession.userId,
      });

      sandbox.stub(plaid, 'createLinkItemToken').resolves('1234');

      const { body } = await request(app)
        .post('/v2/bank_connection/link_token')
        .send({
          connectionId: connection.id,
          webhook,
        })
        .set('Authorization', userSession.token)
        .set('X-Device-Id', userSession.deviceId)
        .set('X-App-Version', minAppVersion)
        .expect(400);

      expect(body?.data?.createFreshConnection).to.be.true;
      expect(body?.data?.hasOutstandingAdvance).to.be.false;
    });

    it('should force app update for ver < 2.51.0', async () => {
      const appVersion = '2.50.0';
      const userSession: UserSession = await factory.create('user-session');

      const { body } = await request(app)
        .post('/v2/bank_connection/link_token')
        .send({
          webhook,
        })
        .set('Authorization', userSession.token)
        .set('X-Device-Id', userSession.deviceId)
        .set('X-App-Version', appVersion)
        .expect(400);

      expect(body?.message).to.include('Please update to the latest version of Dave');
      expect(body?.customCode).to.be.equal(1000);
    });
  });
});
