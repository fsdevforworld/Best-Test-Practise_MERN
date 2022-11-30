import { moment } from '@dave-inc/time-lib';
import * as request from 'supertest';
import * as sinon from 'sinon';
import app from '../../../src/api';
import * as SynapsepayModels from '../../../src/domain/synapsepay/external-model-definitions';
import * as EmailVerificationHelper from '../../../src/helper/email-verification';
import * as Jobs from '../../../src/jobs/data';
import plaidClient from '../../../src/lib/plaid';
import * as util from '../../../src/lib/utils';
import gcloudKms from '../../../src/lib/gcloud-kms';
import { BankingDataSource, MicroDeposit } from '@dave-inc/wire-typings';
import {
  AuditLog,
  BankAccount,
  BankConnectionTransition,
  User,
  UserSession,
  sequelize,
} from '../../../src/models';
import 'mocha';
import { expect } from 'chai';
import accountSchema from '../../schema/bank-account';
import factory from '../../factories';
import { clean, stubBankTransactionClient, up } from '../../test-helpers';
import * as Bluebird from 'bluebird';
import { QueryTypes } from 'sequelize';
import { MicroDepositType } from '../../../src/models/bank-account';
import { userUpdatedEvent } from '../../../src/domain/event';
import SynapsepayNodeLib from '../../../src/domain/synapsepay/node';
import { MicrodepositVerificationKey } from '../../../src/translations';
import { AnalyticsEvent } from '../../../src/typings';

describe('/v2/bank_account/*', () => {
  const sandbox = sinon.createSandbox();

  const TEST_REMOTE = process.env.TEST_REMOTE === 'true';

  // clean everything before we start
  before(() => clean());

  // insert user and user_session data
  beforeEach(() => {
    sandbox.stub(SynapsepayModels.helpers, 'getUserIP').resolves('127.0.0.1');
    stubBankTransactionClient(sandbox);
    return up();
  });

  //truncate user and user_session data
  afterEach(() => clean(sandbox));

  describe('GET /bank_account', () => {
    it('should get all the accounts for a user', async () => {
      const result = await request(app)
        .get('/v2/bank_account')
        .set('Authorization', 'token-700')
        .set('X-Device-Id', 'id-700');
      expect(result.status).to.equal(200);
      expect(result.body).to.be.jsonSchema(accountSchema);
      expect(result.body.length).to.equal(3);
      expect(result.body[0].id).to.equal(702);
      expect(result.body[0].approval.isSupportOverride).to.equal(false);
      expect(result.body[0].paymentMethod.invalid).to.equal('2018-01-01T00:00:00.000Z');
      expect(result.body[1].id).to.equal(701);
      expect(result.body[2].id).to.equal(700);
      expect(result.body[2].approval.isSupportOverride).to.equal(true);
      expect(result.body[2].paymentMethod.invalid).to.be.null;
    });

    it('should return the number of transactions as a property', async () => {
      const bankAccount = await factory.create('checking-account');
      const user = await User.findByPk(bankAccount.userId);
      for (let i = 0; i < 5; i++) {
        await factory.create('bank-transaction', {
          bankAccountId: bankAccount.id,
          userId: bankAccount.userId,
        });
      }

      const result = await request(app)
        .get('/v2/bank_account')
        .set('Authorization', user.id.toString())
        .set('X-Device-Id', user.id.toString());

      expect(result.status).to.equal(200);
      expect(result.body[0].numTransactions).to.equal(5);
    });

    it('should not add an audit log row for advance approval', async () => {
      await request(app)
        .get('/v2/bank_account')
        .set('Authorization', 'token-700')
        .set('X-Device-Id', 'id-700');
      const logs = await AuditLog.findAll({ where: { userId: 700 } });
      expect(logs.length).to.equal(0);
    });

    it('should include soft-deleted default accounts', async () => {
      const connection = await factory.create('bank-connection');
      const user = await connection.getUser();

      const deletedDefaultAccount = await factory.create('bank-account', {
        lastFour: '1111',
        bankConnectionId: connection.id,
        userId: user.id,
        subtype: 'CHECKING',
      });
      await factory.create('bank-account', {
        lastFour: '2222',
        bankConnectionId: connection.id,
        userId: user.id,
        subtype: 'CHECKING',
      });
      await factory.create('bank-account', {
        lastFour: '3333',
        bankConnectionId: connection.id,
        userId: user.id,
        subtype: 'CHECKING',
      });

      await user.update({ defaultBankAccountId: deletedDefaultAccount.id });

      await deletedDefaultAccount.destroy();

      const session = await UserSession.findOne({ where: { userId: user.id } });

      const result = await request(app)
        .get('/v2/bank_account')
        .set('Authorization', session.token)
        .set('X-Device-Id', session.deviceId)
        .set('X-App-Version', '2.7.9');

      expect(result.status).to.equal(200);
      expect(result.body).to.be.jsonSchema(accountSchema);
      expect(result.body.length).to.equal(3);
      expect(result.body.map((ba: any) => ba.id)).to.contain(deletedDefaultAccount.id);
    });

    it('should not include soft-deleted non-default accounts', async () => {
      const connection = await factory.create('bank-connection');
      const user = await connection.getUser();

      const defaultAccount = await factory.create('bank-account', {
        lastFour: '1234',
        bankConnectionId: connection.id,
        userId: user.id,
        subtype: 'CHECKING',
      });

      await user.update({ defaultBankAccountId: defaultAccount.id });

      const deletedAccounts: BankAccount[] = [];

      deletedAccounts.push(
        await factory.create('bank-account', {
          lastFour: '1111',
          bankConnectionId: connection.id,
          userId: user.id,
          subtype: 'CHECKING',
        }),
      );
      deletedAccounts.push(
        await factory.create('bank-account', {
          lastFour: '2222',
          bankConnectionId: connection.id,
          userId: user.id,
          subtype: 'CHECKING',
        }),
      );

      const session = await UserSession.findOne({ where: { userId: user.id } });

      const before = await request(app)
        .get('/v2/bank_account')
        .set('Authorization', session.token)
        .set('X-Device-Id', session.deviceId)
        .set('X-App-Version', '2.7.9');

      expect(before.status).to.equal(200);
      expect(before.body.length).to.equal(3);
      expect(before.body.map((acc: any) => acc.id)).to.contain(defaultAccount.id);
      expect(before.body.map((acc: any) => acc.id)).to.contain(deletedAccounts[0].id);
      expect(before.body.map((acc: any) => acc.id)).to.contain(deletedAccounts[1].id);

      await defaultAccount.destroy();
      await Bluebird.map(deletedAccounts, async (account: BankAccount) => await account.destroy(), {
        concurrency: 2,
      });

      const after = await request(app)
        .get('/v2/bank_account')
        .set('Authorization', session.token)
        .set('X-Device-Id', session.deviceId)
        .set('X-App-Version', '2.7.9');

      expect(after.status).to.equal(200);
      expect(after.body.length).to.equal(1);
      expect(after.body.map((acc: any) => acc.id)).to.contain(defaultAccount.id);
      expect(after.body.map((acc: any) => acc.id)).to.not.contain(deletedAccounts[0].id);
      expect(after.body.map((acc: any) => acc.id)).to.not.contain(deletedAccounts[1].id);
    });

    it('should have `hasReceivedFirstPaycheck` equals `true` for Dave Bank account with direct deposit', async () => {
      const plaidBankConnection = await factory.create('bank-connection');
      const user = await plaidBankConnection.getUser();
      const plaidBankAccount = await factory.create('bank-account', {
        userId: user.id,
        bankConnectionId: plaidBankConnection.id,
        subtype: 'CHECKING',
      });

      const bodBankConnection = await factory.create('bank-connection', {
        userId: user.id,
        bankingDataSource: BankingDataSource.BankOfDave,
      });
      const bodBankAccount = await factory.create('bank-account', {
        userId: user.id,
        bankConnectionId: bodBankConnection.id,
        mainPaycheckRecurringTransactionId: null,
        subtype: 'CHECKING',
      });

      await BankConnectionTransition.create({
        fromBankConnectionId: plaidBankConnection.id,
        toBankConnectionId: bodBankConnection.id,
        fromDefaultBankAccountId: plaidBankAccount.id,
        hasActivatedPhysicalCard: true,
        hasReceivedFirstPaycheck: true,
      });

      await user.update({ defaultBankAccountId: bodBankAccount.id });

      const session = await UserSession.findOne({ where: { userId: user.id } });
      const response = await request(app)
        .get('/v2/bank_account')
        .set('Authorization', session.token)
        .set('X-Device-Id', session.deviceId)
        .set('X-App-Version', '2.7.9');
      const defaultAccount = response.body.find((account: any) => account.id === bodBankAccount.id);

      expect(defaultAccount.hasReceivedFirstPaycheck).to.equal(true);
    });

    it('should have `hasReceivedFirstPaycheck` equals `false` for Dave Bank account without direct deposit', async () => {
      const plaidBankConnection = await factory.create('bank-connection');
      const user = await plaidBankConnection.getUser();
      const plaidBankAccount = await factory.create('bank-account', {
        userId: user.id,
        bankConnectionId: plaidBankConnection.id,
        subtype: 'CHECKING',
      });

      const bodBankConnection = await factory.create('bank-connection', {
        userId: user.id,
        bankingDataSource: BankingDataSource.BankOfDave,
      });
      const bodBankAccount = await factory.create('bank-account', {
        userId: user.id,
        bankConnectionId: bodBankConnection.id,
        mainPaycheckRecurringTransactionId: null,
        subtype: 'CHECKING',
      });

      await BankConnectionTransition.create({
        fromBankConnectionId: plaidBankConnection.id,
        toBankConnectionId: bodBankConnection.id,
        fromDefaultBankAccountId: plaidBankAccount.id,
        hasActivatedPhysicalCard: true,
        hasReceivedFirstPaycheck: false,
      });

      await user.update({ defaultBankAccountId: bodBankAccount.id });

      const session = await UserSession.findOne({ where: { userId: user.id } });
      const response = await request(app)
        .get('/v2/bank_account')
        .set('Authorization', session.token)
        .set('X-Device-Id', session.deviceId)
        .set('X-App-Version', '2.7.9');
      const defaultAccount = response.body.find((account: any) => account.id === bodBankAccount.id);

      expect(defaultAccount.hasReceivedFirstPaycheck).to.equal(false);
    });

    it('should have `hasReceivedFirstPaycheck` equals `null` for a Plaid account with/without direct deposit', async () => {
      const plaidBankConnection = await factory.create('bank-connection', {});
      const user = await plaidBankConnection.getUser();
      const plaidBankAccount = await factory.create('bank-account', {
        userId: plaidBankConnection.userId,
        bankConnectionId: plaidBankConnection.id,
        subtype: 'CHECKING',
      });
      await user.update({ defaultBankAccountId: plaidBankAccount.id });

      const session = await UserSession.findOne({ where: { userId: user.id } });
      const response = await request(app)
        .get('/v2/bank_account')
        .set('Authorization', session.token)
        .set('X-Device-Id', session.deviceId)
        .set('X-App-Version', '2.7.9');
      const defaultAccount = response.body.find(
        (account: any) => account.id === plaidBankAccount.id,
      );

      expect(defaultAccount.hasReceivedFirstPaycheck).to.equal(null);
    });
  });

  describe('DELETE /bank_account/:id', () => {
    it('should fail if the bank account is not found', async () => {
      const result = await request(app)
        .delete('/v2/bank_account/foobar')
        .set('Authorization', 'token-700')
        .set('X-Device-Id', 'id-700');

      expect(result.status).to.equal(404);
    });

    it('should fail if the bank account does not belong to the user', async () => {
      const result = await request(app)
        .delete('/v2/bank_account/1')
        .set('Authorization', 'token-700')
        .set('X-Device-Id', 'id-700');

      expect(result.status).to.equal(404);
    });

    it('should fail if the user has only one bank connection', async () => {
      const result = await request(app)
        .delete('/v2/bank_account/700')
        .set('Authorization', 'token-700')
        .set('X-Device-Id', 'id-700');

      expect(result.status).to.equal(400);
      expect(result.body.message).to.match(/only bank connection/);
    });

    it('should fail if the user has any active advances w/ this account', async () => {
      const result = await request(app)
        .delete('/v2/bank_account/703')
        .set('Authorization', 'token-701')
        .set('X-Device-Id', 'id-701');

      expect(result.status).to.equal(409);
      expect(result.body.message).to.match(/an active advance/);
    });

    it('should soft delete if the user has no advances w/ this account', async () => {
      sandbox.stub(plaidClient, 'removeItem').resolves();
      const result = await request(app)
        .delete('/v2/bank_account/704')
        .set('Authorization', 'token-701')
        .set('X-Device-Id', 'id-701');

      expect(result.status).to.equal(200);
      const bankAccounts = await sequelize.query<any>('SELECT * FROM bank_account WHERE id = 704', {
        type: QueryTypes.SELECT,
      });
      expect(bankAccounts.length).to.equal(1);
    });

    it('should not delete if the user has advances w/ this account', async () => {
      sandbox.stub(plaidClient, 'removeItem').resolves();

      await factory.create('advance', {
        bankAccountId: 705,
      });

      const result = await request(app)
        .delete('/v2/bank_account/705')
        .set('Authorization', 'token-701')
        .set('X-Device-Id', 'id-701');

      expect(result.status).to.equal(400);

      const bankAccount = await BankAccount.findByPk(705);
      expect(bankAccount.deleted).to.eq(null);
    });
  });

  describe('/notification', () => {
    it('Should set pre approval waitlist for bank account', async () => {
      const result = await request(app)
        .post('/v2/bank_account/705/notification')
        .set('Authorization', 'token-701')
        .set('X-Device-Id', 'id-701');

      expect(result.status).to.equal(200);
      const bankAccounts = await sequelize.query<any>('SELECT * FROM bank_account WHERE id = 705', {
        type: QueryTypes.SELECT,
      });
      expect(bankAccounts[0].pre_approval_waitlist.format()).to.equal(
        moment()
          .startOf('day')
          .format(),
      );
    });

    it('Should unset pre approval waitlist for bank account', async () => {
      const result = await request(app)
        .del('/v2/bank_account/705/notification')
        .set('Authorization', 'token-701')
        .set('X-Device-Id', 'id-701');

      expect(result.status).to.equal(200);
      const bankAccounts = await sequelize.query<any>('SELECT * FROM bank_account WHERE id = 705', {
        type: QueryTypes.SELECT,
      });
      expect(bankAccounts[0].pre_approval_waitlist).to.equal(null);
    });
  });

  describe('PATCH /bank_account', () => {
    it('should set and not be able to unset recurring transaction id', async () => {
      const result = await request(app)
        .patch('/v2/bank_account/706')
        .set('Authorization', 'token-701')
        .set('X-Device-Id', 'id-701')
        .send({ mainPaycheckRecurringTransactionId: 117 });

      expect(result.status).to.equal(200);
      const bankAccounts = await sequelize.query<any>('SELECT * FROM bank_account WHERE id = 706', {
        type: QueryTypes.SELECT,
      });
      expect(bankAccounts[0].main_paycheck_recurring_transaction_id).to.equal(117);

      const result2 = await request(app)
        .patch('/v2/bank_account/706')
        .set('Authorization', 'token-701')
        .set('X-Device-Id', 'id-701')
        .send({ mainPaycheckRecurringTransactionId: null });

      expect(result2.status).to.equal(200);
      const bankAccounts2 = await sequelize.query<any>(
        'SELECT * FROM bank_account WHERE id = 706',
        {
          type: QueryTypes.SELECT,
        },
      );
      expect(bankAccounts2[0].main_paycheck_recurring_transaction_id).to.equal(117);
    });

    it('should not set for nonexistent recurring transaction id', async () => {
      const result = await request(app)
        .patch('/v2/bank_account/706')
        .set('Authorization', 'token-701')
        .set('X-Device-Id', 'id-701')
        .send({ mainPaycheckRecurringTransactionId: 1 });

      expect(result.status).to.equal(404);
      const bankAccounts = await sequelize.query<any>('SELECT * FROM bank_account WHERE id = 706', {
        type: QueryTypes.SELECT,
      });
      expect(bankAccounts[0].main_paycheck_recurring_transaction_id).to.equal(null);
    });
  });

  if (TEST_REMOTE) {
    describe('POST /:bankAccountId/add_account_routing', async () => {
      const bankAccountId = 1200;
      const routing = '124085066';
      const account = '565777';
      const auth = {
        account,
        routing,
        firstName: 'Test',
        lastName: 'Test',
        email: 'test@dave.com',
      };

      it('success with account and routing', async () => {
        await request(app)
          .post(`/v2/bank_account/${bankAccountId}/add_account_routing`)
          .set('Authorization', 'token-1200')
          .set('X-Device-Id', 'id-1200')
          .set('X-App-Version', '2.39.0')
          .send(auth)
          .expect(200)
          .then(async res => {
            expect(res.body.message).to.match(/Added your account and routing number/);
            const bankAccount = await BankAccount.findByPk(bankAccountId);
            expect(bankAccount).to.not.equal(null);
            expect(bankAccount.synapseNodeId).to.not.equal(null);
            expect(bankAccount.microDeposit).to.equal('REQUIRED');
            //expect(bankAccount.hasAccountRouting).to.equal(true);
            expect(bankAccount.microDepositCreated).to.be.an.instanceof(moment);
            return res.body;
          });
      }).timeout(20000);

      it('fail adding same account routing for same user', async () => {
        await request(app)
          .post(`/v2/bank_account/${bankAccountId}/add_account_routing`)
          .set('Authorization', 'token-1200')
          .set('X-Device-Id', 'id-1200')
          .set('X-App-Version', '2.39.0')
          .send(auth);

        await request(app)
          .post(`/v2/bank_account/${bankAccountId}/add_account_routing`)
          .set('Authorization', 'token-1200')
          .set('X-Device-Id', 'id-1200')
          .set('X-App-Version', '2.39.0')
          .send(auth)
          .expect(200)
          .then(res => {
            expect(res.body.message).to.match(/You entered in the same info last time/);
          });
      }).timeout(20000);

      it('fail adding same account routing for different user', async () => {
        await request(app)
          .post(`/v2/bank_account/${bankAccountId}/add_account_routing`)
          .set('Authorization', 'token-1200')
          .set('X-Device-Id', 'id-1200')
          .set('X-App-Version', '2.39.0')
          .send(auth);

        await request(app)
          .post(`/v2/bank_account/5/add_account_routing`)
          .set('Authorization', 'token-5')
          .set('X-Device-Id', 'id-5')
          .set('X-App-Version', '2.39.0')
          .send(auth)
          .expect(409)
          .then(res => {
            expect(res.body.message).to.match(/Duplicate accounts found/);
          });
      }).timeout(20000);

      it('fail re-initiating micro deposit before verification attempt', async () => {
        await request(app)
          .post(`/v2/bank_account/${bankAccountId}/add_account_routing`)
          .set('Authorization', 'token-1200')
          .set('X-Device-Id', 'id-1200')
          .set('X-App-Version', '2.39.0')
          .send(auth);

        await request(app)
          .post(`/v2/bank_account/${bankAccountId}/recreate_micro_deposit`)
          .set('Authorization', 'token-1200')
          .set('X-Device-Id', 'id-1200')
          .set('X-App-Version', '2.39.0')
          .send({})
          .expect(200)
          .then(async res => {
            expect(res.body.message).to.match(/attempt validating micro deposit at least once/);
            const bankAccount = await BankAccount.findByPk(bankAccountId);
            expect(bankAccount.microDeposit).to.equal('REQUIRED');
          });
      }).timeout(20000);
    });
  }

  describe('POST /bankAccount/:bankAccountId/add_account_routing', async () => {
    let updateSynapsepayJobStub: sinon.SinonStub;
    let updateBrazeJobStub: sinon.SinonStub;

    beforeEach(() => {
      updateSynapsepayJobStub = sandbox.stub(Jobs, 'updateSynapsepayUserTask');
      updateBrazeJobStub = sandbox.stub(Jobs, 'updateBrazeTask');
      sandbox.stub(userUpdatedEvent, 'publish');
    });

    it('fail with an old version', async () => {
      const bankAccountId = 200;
      const routing = '124085066';
      const account = '565777';
      const auth = {
        account,
        routing,
        firstName: 'Test',
        lastName: 'Test',
        email: 'test@dave.com',
      };
      return request(app)
        .post(`/v2/bank_account/${bankAccountId}/add_account_routing`)
        .set('Authorization', 'token-200')
        .set('X-Device-Id', 'id-200')
        .set('X-App-Version', '2.38.0')
        .send(auth)
        .expect(400)
        .then(res => {
          expect(res.body.message).to.match(/Please update to the latest version of Dave/);
        });
    });

    it('fail with invalid routing number', async () => {
      const bankAccountId = 200;
      const routing = '221000021';
      const account = '565777';
      const auth = {
        account,
        routing,
        firstName: 'Test',
        lastName: 'Test',
        email: 'test@dave.com',
      };
      return request(app)
        .post(`/v2/bank_account/${bankAccountId}/add_account_routing`)
        .set('Authorization', 'token-200')
        .set('X-Device-Id', 'id-200')
        .set('X-App-Version', '2.39.0')
        .send(auth)
        .expect(200)
        .then(res => {
          expect(res.body.message).to.match(/Routing number should be 9 digits/);
          expect(res.body.success).to.equal(false);
        });
    });

    it('should throw an error if email already exists for another user', async () => {
      const bankAccountId = 200;
      const routing = '021000021';
      const account = '565777';
      const auth = {
        account,
        routing,
        firstName: 'Test',
        lastName: 'Test',
        email: '9@dave.com',
      };
      const emailVerificationHelperSpy = sandbox.spy(EmailVerificationHelper, 'sendEmail');
      const response = await request(app)
        .post(`/v2/bank_account/${bankAccountId}/add_account_routing`)
        .set('Authorization', 'token-200')
        .set('X-Device-Id', 'id-200')
        .set('X-App-Version', '2.39.0')
        .send(auth);
      sinon.assert.notCalled(emailVerificationHelperSpy);
      expect(response.status).to.be.equal(409);
      expect(response.body.message).to.be.match(
        /A user with this email already exists, please enter a different email\./,
      );
    });

    it('fail with non valid ACH-US routing number', async () => {
      const bankAccountId = 200;
      const routing = '123123123';
      const account = '565777';
      const auth = {
        account,
        routing,
        firstName: 'Test',
        lastName: 'Test',
        email: 'test@dave.com',
      };
      const err = {
        response: {
          body: {
            error: {
              en: `Invalid field value supplied. ${routing} is not a valid ACH-US routing_num.`,
            },
          },
        },
      };
      sandbox.stub(SynapsepayModels.users, 'getAsync').resolves({});
      sandbox
        .stub(gcloudKms, 'encrypt')
        .resolves({ ciphertext: `${auth.account}|${auth.routing}` });
      sandbox.stub(gcloudKms, 'decrypt').resolves(`${auth.account}|${auth.routing}`);
      sandbox.stub(SynapsepayModels.nodes, 'createAsync').rejects(err);
      return request(app)
        .post(`/v2/bank_account/${bankAccountId}/add_account_routing`)
        .set('Authorization', 'token-200')
        .set('X-Device-Id', 'id-200')
        .set('X-App-Version', '2.39.0')
        .send(auth)
        .expect(200)
        .then(res => {
          const error = new RegExp(`${routing} is not a valid ACH-US routing number`);
          expect(res.body.message).to.match(error);
          expect(res.body.success).to.equal(false);
        });
    });

    it('fail with min length 4 account number', async () => {
      const bankAccountId = 200;
      const routing = '124085066';
      const account = '5657';
      const auth = {
        account,
        routing,
        firstName: 'Test',
        lastName: 'Test',
        email: 'test@dave.com',
      };
      sandbox.stub(SynapsepayModels.users, 'getAsync').resolves(true);
      sandbox
        .stub(gcloudKms, 'encrypt')
        .resolves({ ciphertext: `${auth.account}|${auth.routing}` });
      sandbox.stub(gcloudKms, 'decrypt').resolves(`${auth.account}|${auth.routing}`);
      const err = {
        response: {
          body: {
            error: {
              en: `${account} is too short..Failed validating 'minLength' in schema['properties']['info']['properties']['account_num']`,
            },
          },
        },
      };
      // expected '565777 is too short..' to match /123123123 is not a valid ACH-US routing number/
      sandbox.stub(SynapsepayModels.nodes, 'createAsync').rejects(err);
      sandbox.stub(util, 'validateAccountNumber').resolves(true);
      return request(app)
        .post(`/v2/bank_account/${bankAccountId}/add_account_routing`)
        .set('Authorization', 'token-200')
        .set('X-Device-Id', 'id-200')
        .set('X-App-Version', '2.39.0')
        .send(auth)
        .expect(200)
        .then(res => {
          const errMsg = new RegExp(`${account} is too short`);
          expect(res.body.message).to.match(errMsg);
          expect(res.body.success).to.equal(false);
        });
    });

    it('fail with other synapsepay error messages that we can not handle', async () => {
      const bankAccountId = 200;
      const routing = '124085066';
      const account = '565777';
      const auth = {
        account,
        routing,
        firstName: 'Test',
        lastName: 'Test',
        email: 'test@dave.com',
      };
      const err = {
        response: {
          body: {
            error: {
              en: `Some random error message from synapsepay`,
            },
          },
        },
      };
      sandbox
        .stub(gcloudKms, 'encrypt')
        .resolves({ ciphertext: `${auth.account}|${auth.routing}` });
      sandbox.stub(gcloudKms, 'decrypt').resolves(`${auth.account}|${auth.routing}`);
      sandbox.stub(SynapsepayModels.users, 'getAsync').resolves(true);
      sandbox.stub(SynapsepayModels.nodes, 'createAsync').rejects(err);
      sandbox.stub(util, 'validateAccountNumber').resolves(true);
      return request(app)
        .post(`/v2/bank_account/${bankAccountId}/add_account_routing`)
        .set('Authorization', 'token-200')
        .set('X-Device-Id', 'id-200')
        .set('X-App-Version', '2.39.0')
        .send(auth)
        .expect(200)
        .then(res => {
          expect(res.body.message).to.match(/Error adding your account and routing number/);
          expect(res.body.success).to.equal(false);
        });
    });

    it('fail with invalid account number', async () => {
      const bankAccountId = 200;
      const routing = '124085066';
      const account = '577';
      const auth = {
        account,
        routing,
        firstName: 'Test',
        lastName: 'Test',
        email: 'test@dave.com',
      };
      return request(app)
        .post(`/v2/bank_account/${bankAccountId}/add_account_routing`)
        .set('Authorization', 'token-200')
        .set('X-Device-Id', 'id-200')
        .set('X-App-Version', '2.39.0')
        .send(auth)
        .expect(200)
        .then(res => {
          expect(res.body.message).to.match(/Account number should be 4-17 digits/);
          expect(res.body.success).to.equal(false);
        });
    });
    it('fail with 17+ digit account number', async () => {
      const bankAccountId = 200;
      const routing = '124085066';
      const account = '577837738299300012';
      const auth = {
        account,
        routing,
        firstName: 'Test',
        lastName: 'Test',
        email: 'test@dave.com',
      };
      return request(app)
        .post(`/v2/bank_account/${bankAccountId}/add_account_routing`)
        .set('Authorization', 'token-200')
        .set('X-Device-Id', 'id-200')
        .set('X-App-Version', '2.39.0')
        .send(auth)
        .expect(200)
        .then(res => {
          expect(res.body.message).to.match(/Account number should be 4-17 digits/);
          expect(res.body.success).to.equal(false);
        });
    });

    it('fail with no first name', async () => {
      const bankAccountId = 1200;
      const auth = {
        routing: '021000021',
        account: '565777',
        lastName: 'Test',
        email: 'test@dave.com',
      };
      await request(app)
        .post(`/v2/bank_account/${bankAccountId}/add_account_routing`)
        .set('Authorization', 'token-1200')
        .set('X-Device-Id', 'id-1200')
        .set('X-App-Version', '2.39.0')
        .send(auth)
        .expect(400)
        .then(res => expect(res.body.type).to.equal('invalid_parameters'));
    }).timeout(20000);

    it('fail with no last name', async () => {
      const bankAccountId = 1200;
      const auth = {
        routing: '021000021',
        account: '565777',
        firstName: 'Test',
        email: 'test@dave.com',
      };
      await request(app)
        .post(`/v2/bank_account/${bankAccountId}/add_account_routing`)
        .set('Authorization', 'token-1200')
        .set('X-Device-Id', 'id-1200')
        .set('X-App-Version', '2.39.0')
        .send(auth)
        .expect(400)
        .then(res => expect(res.body.type).to.equal('invalid_parameters'));
    }).timeout(20000);

    it('fail with no email', async () => {
      const bankAccountId = 1200;
      const auth = {
        routing: '021000021',
        account: '565777',
        firstName: 'Test',
        lastName: 'Test',
      };
      await request(app)
        .post(`/v2/bank_account/${bankAccountId}/add_account_routing`)
        .set('Authorization', 'token-1200')
        .set('X-Device-Id', 'id-1200')
        .set('X-App-Version', '2.39.0')
        .send(auth)
        .expect(400)
        .then(res => expect(res.body.type).to.equal('invalid_parameters'));
    }).timeout(20000);

    it('fail with duplicate email', async () => {
      const email = 'raeb.eht@evad';
      await factory.create('user', { email });

      const bankAccountId = 1200;
      const auth = {
        routing: '021000021',
        account: '565777',
        firstName: 'Test',
        lastName: 'Test',
        email,
      };
      const emailVerificationHelperSpy = sandbox.spy(EmailVerificationHelper, 'sendEmail');
      const response = await request(app)
        .post(`/v2/bank_account/${bankAccountId}/add_account_routing`)
        .set('Authorization', 'token-1200')
        .set('X-Device-Id', 'id-1200')
        .set('X-App-Version', '2.39.0')
        .send(auth);
      sinon.assert.notCalled(emailVerificationHelperSpy);
      expect(response.status).to.be.equal(409);
      expect(response.body.message).to.be.match(
        /A user with this email already exists, please enter a different email\./,
      );
    }).timeout(20000);

    it('success with completed micro deposit for matching deleted account', async () => {
      // User with a deleted account and completed micro deposit
      const userId = 1200;

      // Bank info that we want to connect
      const bankAccountId = 1202;
      const auth = {
        routing: '021000021',
        account: '12345678',
        firstName: 'Kevin',
        lastName: 'H',
        email: 'kevin@dave.com',
      };
      // Dont actually hash/decrypt
      sandbox.stub(gcloudKms, 'decrypt').resolves(`${auth.account}|${auth.routing}`);
      sandbox.stub(BankAccount, 'hashAccountNumber').returns(`${auth.account}|${auth.routing}`);

      // Verify deleted account exists with same routing number
      const deletedAccount = await BankAccount.findOne({
        where: { userId, microDeposit: MicroDeposit.COMPLETED },
        paranoid: false,
      });

      // Hash the new account number, decrypt the old
      const hashed = BankAccount.hashAccountNumber(auth.account, auth.routing);
      const decrypted = await gcloudKms.decrypt(deletedAccount.accountNumberAes256);

      // Verify test is correctly set up to give us the results we want
      expect(deletedAccount.id).to.equal(1203);
      expect(deletedAccount.deleted).to.not.equal(null);
      expect(deletedAccount.microDeposit).to.equal(MicroDeposit.COMPLETED);
      expect(hashed).to.equal(decrypted);

      await request(app)
        .post(`/v2/bank_account/${bankAccountId}/add_account_routing`)
        .set('Authorization', 'token-1200')
        .set('X-Device-Id', 'id-1200')
        .set('X-App-Version', '2.39.0')
        .send(auth)
        .expect(200)
        .then(async res => {
          expect(res.body.message).to.match(/This account already passed micro deposit/);
          const bankAccount = await BankAccount.findByPk(bankAccountId);
          expect(bankAccount.microDeposit).to.equal(MicroDeposit.COMPLETED);
          const auditLogEntry = await AuditLog.findAll({ where: { userId: 1200 } });
          expect(auditLogEntry[0].type).to.equal(AuditLog.TYPES.NAME_UPDATE_FROM_ADD_ROUTING);
        });
      sinon.assert.calledWithExactly(updateBrazeJobStub.firstCall, {
        userId,
        attributes: { email_verified: true, unverified_email: 'kevin@dave.com' },
        eventProperties: {
          name: AnalyticsEvent.EmailUnverified,
          properties: {
            unverifiedEmail: 'kevin@dave.com',
            obfuscatedEmail: 'k****n@dave.com',
            url: sinon.match.string,
            sendEmail: true,
          },
        },
      });
      sinon.assert.calledWithExactly(updateBrazeJobStub.secondCall, {
        userId,
        attributes: { firstName: 'Kevin', lastName: 'H' },
        eventProperties: [{ name: AnalyticsEvent.NameUpdated }],
      });
      sinon.assert.calledWithExactly(updateSynapsepayJobStub, {
        userId,
        options: {
          fields: {
            addressLine1: undefined,
            addressLine2: undefined,
            birthdate: undefined,
            city: undefined,
            firstName: 'Kevin',
            lastName: 'H',
            license: undefined,
            state: undefined,
            zipCode: undefined,
          },
        },
      });
    }).timeout(20000);

    it('does not update first name and last name if they are the same', async () => {
      const firstName = 'Kevin';
      const lastName = 'Rip Kevin';
      const user = await factory.create('user', { firstName, lastName });
      const bankAccount = await factory.create('bank-account', { userId: user.id });
      const auth = {
        routing: '021000021',
        account: '123456789',
        firstName,
        lastName,
        email: 'kevin@dave.com',
      };
      sandbox.stub(BankAccount, 'hashAccountNumber').returns(`${auth.account}|${auth.routing}`);
      sandbox.stub(SynapsepayNodeLib, 'createMicroDeposit').resolves();
      await request(app)
        .post(`/v2/bank_account/${bankAccount.id}/add_account_routing`)
        .set('Authorization', `${user.id}`)
        .set('X-Device-Id', `${user.id}`)
        .set('X-App-Version', '2.39.0')
        .send(auth)
        .expect(200);
      sinon.assert.calledWithExactly(updateBrazeJobStub, {
        userId: user.id,
        attributes: { email_verified: false, unverified_email: 'kevin@dave.com' },
        eventProperties: {
          name: AnalyticsEvent.EmailUnverified,
          properties: {
            unverifiedEmail: 'kevin@dave.com',
            obfuscatedEmail: 'k****n@dave.com',
            url: sinon.match.string,
            sendEmail: true,
          },
        },
      });
      sinon.assert.notCalled(updateSynapsepayJobStub);
    });
  });

  describe('POST /bank_account/:bankAccountId/verify_micro_deposit', async () => {
    it('should return true if synapse returns true', async () => {
      const connection = await factory.create('bank-connection');
      const user = await connection.getUser();

      const session = await UserSession.findOne({ where: { userId: user.id } });
      const bankAccount = await factory.create('checking-account', {
        userId: user.id,
      });
      sandbox.stub(SynapsepayNodeLib, 'verifyMicroDeposit').resolves(true);
      const respRegEx = new RegExp(MicrodepositVerificationKey.VerifiedMicroDeposit);
      return request(app)
        .post(`/v2/bank_account/${bankAccount.id}/verify_micro_deposit`)
        .set('Authorization', session.token)
        .set('X-Device-Id', session.deviceId)
        .send({ amount1: 20, amount2: 30 })
        .expect(200)
        .then(res => {
          expect(res.body.message).to.match(respRegEx);
          expect(res.body.success).to.equal(true);
        });
    });

    it('should return false if synapse returns false', async () => {
      const connection = await factory.create('bank-connection');
      const user = await connection.getUser();

      const session = await UserSession.findOne({ where: { userId: user.id } });
      const bankAccount = await factory.create('checking-account', {
        userId: user.id,
      });
      sandbox.stub(SynapsepayNodeLib, 'verifyMicroDeposit').resolves(false);
      return request(app)
        .post(`/v2/bank_account/${bankAccount.id}/verify_micro_deposit`)
        .set('Authorization', session.token)
        .set('X-Device-Id', session.deviceId)
        .send({ amount1: 20, amount2: 30 })
        .expect(401);
    });

    it('should 404 if bank account not found', async () => {
      const connection = await factory.create('bank-connection');
      const user = await connection.getUser();

      const session = await UserSession.findOne({ where: { userId: user.id } });
      const bankAccount = await factory.create('checking-account', {
        userId: user.id,
      });

      const nonExistentId = bankAccount.id + 1;

      return request(app)
        .post(`/v2/bank_account/${nonExistentId}/verify_micro_deposit`)
        .set('Authorization', session.token)
        .set('X-Device-Id', session.deviceId)
        .send({ amount1: 20, amount2: 30 })
        .expect(404)
        .then(res => {
          expect(res.body.message).to.match(/Cannot find bank account with id:/);
        });
    });

    it('should return true if already verified', async () => {
      const connection = await factory.create('bank-connection');
      const user = await connection.getUser();

      const session = await UserSession.findOne({ where: { userId: user.id } });
      const bankAccount = await factory.create('checking-account', {
        userId: user.id,
        microDeposit: MicroDepositType.Completed,
      });
      sandbox.stub(SynapsepayNodeLib, 'verifyMicroDeposit').resolves(true);
      const respRegEx = new RegExp(MicrodepositVerificationKey.BankAccountAlreadyVerified);
      return request(app)
        .post(`/v2/bank_account/${bankAccount.id}/verify_micro_deposit`)
        .set('Authorization', session.token)
        .set('X-Device-Id', session.deviceId)
        .send({ amount1: 20, amount2: 30 })
        .expect(200)
        .then(res => {
          expect(res.body.message).to.match(respRegEx);
          expect(res.body.success).to.equal(true);
        });
    });

    it('should fail if one or both of the amounts is missing', async () => {
      const connection = await factory.create('bank-connection');
      const user = await connection.getUser();

      const session = await UserSession.findOne({ where: { userId: user.id } });
      const bankAccount = await factory.create('checking-account', {
        userId: user.id,
        microDeposit: MicroDepositType.Completed,
      });
      sandbox.stub(SynapsepayNodeLib, 'verifyMicroDeposit').resolves(true);

      request(app)
        .post(`/v2/bank_account/${bankAccount.id}/verify_micro_deposit`)
        .set('Authorization', session.token)
        .set('X-Device-Id', session.deviceId)
        .send({})
        .expect(400)
        .then(res => {
          expect(res.body.message).to.match(/required parameters/i);
        });

      request(app)
        .post(`/v2/bank_account/${bankAccount.id}/verify_micro_deposit`)
        .set('Authorization', session.token)
        .set('X-Device-Id', session.deviceId)
        .send({ amount1: 20 })
        .expect(400)
        .then(res => {
          expect(res.body.message).to.match(/required parameters/i);
        });

      request(app)
        .post(`/v2/bank_account/${bankAccount.id}/verify_micro_deposit`)
        .set('Authorization', session.token)
        .set('X-Device-Id', session.deviceId)
        .send({ amount2: 20 })
        .expect(400)
        .then(res => {
          expect(res.body.message).to.match(/required parameters/i);
        });
    });
  });
});
