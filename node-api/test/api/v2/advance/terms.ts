import { MicroDeposit } from '@dave-inc/wire-typings';
import { ScoringApi } from '@dave-inc/oracle-client';
import {
  clean,
  fakeDateTime,
  stubBalanceLogClient,
  stubBankTransactionClient,
  stubLoomisClient,
  stubPredictedPaybackML,
  up,
} from '../../../test-helpers';
import sendgrid from '../../../../src/lib/sendgrid';
import twilio from '../../../../src/lib/twilio';
import * as sinon from 'sinon';
import { SinonStub } from 'sinon';
import * as request from 'supertest';
import app from '../../../../src/api';
import { DEFAULT_TIMEZONE, moment } from '@dave-inc/time-lib';
import { expect } from 'chai';
import * as Jobs from '../../../../src/jobs/data';
import { BankAccount, Payment, User, UserSession } from '../../../../src/models';
import factory from '../../../factories';
import { CUSTOM_ERROR_CODES } from '../../../../src/lib/error';
import { MIN_VERSION } from '../../../../src/api/v2/advance';
import Counter from '../../../../src/lib/counter';
import { PREDICTED_PAYBACK_MODEL_CONFIG } from '../../../../src/domain/machine-learning';
import { generateBankingDataSource } from '../../../../src/domain/banking-data-source';
import { insertFixtureBankTransactions } from '../../../test-helpers/bank-transaction-fixtures';
import AdvanceApprovalClient from '../../../../src/lib/advance-approval-client';
import { AdvanceApprovalCreateResponse } from '../../../../src/services/advance-approval/types';

describe('GET /advance/terms', () => {
  const sandbox = sinon.createSandbox();
  let predictedPaybackStub: SinonStub;

  before(() => clean());

  let FailureResponse: AdvanceApprovalCreateResponse;
  let SuccessResponse: AdvanceApprovalCreateResponse;

  // insert user and user_session data
  beforeEach(async () => {
    sandbox.stub(twilio, 'send').resolves();
    sandbox.stub(sendgrid, 'send').resolves();
    sandbox.stub(Counter.prototype, 'getValue').resolves(0);
    predictedPaybackStub = stubPredictedPaybackML(sandbox);
    stubBalanceLogClient(sandbox);
    stubLoomisClient(sandbox);
    stubBankTransactionClient(sandbox);
    insertFixtureBankTransactions();
    SuccessResponse = await factory.build('create-approval-success');
    FailureResponse = await factory.build('create-approval-failure');
    return up();
  });

  //truncate user and user_session data
  afterEach(() => clean(sandbox));

  let account: BankAccount;
  it('should fail if the amount is invalid', () => {
    return request(app)
      .get('/v2/advance/terms')
      .set('Authorization', 'token-3')
      .set('X-Device-Id', 'id-3')
      .set('X-App-Version', '2.9.0')
      .query({ amount: 'foobar' })
      .expect(400)
      .then(res => {
        expect(res.body.message).to.match(/Invalid advance amount/);
      });
  });

  it('should fail if the version is invalid', async () => {
    const data = {
      amount: 50,
      bank_account_id: 200,
    };

    const result = await request(app)
      .get('/v2/advance/terms')
      .set('Authorization', 'token-200')
      .set('X-Device-Id', 'id-200')
      .set('X-App-Version', 'bacon')
      .query(data);

    expect(result.status).to.equal(200);
    expect(result.body.approved).to.equal(false);
    expect(result.body.message).to.match(/Please update to the latest version/);
  });

  it('should fail if the version is too low', async () => {
    const data = {
      amount: 50,
      bank_account_id: 200,
    };

    const result = await request(app)
      .get('/v2/advance/terms')
      .set('Authorization', 'token-200')
      .set('X-Device-Id', 'id-200')
      .set('X-App-Version', '2.0.0')
      .query(data);

    expect(result.status).to.equal(200);
    expect(result.body.approved).to.equal(false);
    expect(result.body.message).to.match(/Please update to the latest version/);
  });

  it('should fail if the bank account does not belong to the user', () => {
    const data = {
      bank_account_id: 50,
      amount: 50,
    };

    return request(app)
      .post('/v2/advance')
      .set('Authorization', 'token-3')
      .set('X-Device-Id', 'id-3')
      .set('X-App-Version', '2.9.0')
      .send(data)
      .expect(400)
      .then(res => {
        expect(res.body.message).to.match(/Bank Account not found/);
      });
  });

  it('should fail if the default account is soft-deleted', async () => {
    const connection = await factory.create('bank-connection');
    const user = await connection.getUser();

    const deletedDefaultAccount = await factory.create('bank-account', {
      lastFour: '1111',
      bankConnectionId: connection.id,
      userId: user.id,
      subtype: 'CHECKING',
    });

    await user.update({ defaultBankAccountId: deletedDefaultAccount.id });

    await deletedDefaultAccount.destroy();

    const session = await UserSession.findOne({ where: { userId: user.id } });

    const result = await request(app)
      .get(`/v2/advance/terms?bank_account_id=${deletedDefaultAccount.id}&amount=75`)
      .set('Authorization', session.token)
      .set('X-Device-Id', session.deviceId)
      .set('X-App-Version', MIN_VERSION);

    const { status: httpStatus, body: customError } = result;

    expect(httpStatus).to.equal(400);
    expect(customError.message).to.include(
      'I lost connection to your default bank account. Please update your profile to add or select a different default account',
    );
    expect(customError.customCode).to.equal(CUSTOM_ERROR_CODES.DEFAULT_ACCOUNT_REMOVED);
  });

  it('should set the pre approval waitlist flag on the bank account', async () => {
    account = await factory.create('bank-account');
    await account.update({ preApprovalWaitlist: null });

    sandbox.stub(AdvanceApprovalClient, 'createAdvanceApproval').resolves([FailureResponse]);
    await request(app)
      .get('/v2/advance/terms')
      .set('Authorization', account.userId.toString())
      .set('X-Device-Id', account.userId.toString())
      .set('X-App-Version', '2.9.0')
      .query({ amount: 50, bank_account_id: account.id })
      .expect(200);

    await account.reload();
    expect(account.preApprovalWaitlist).to.be.not.null;
  });

  it('should clear the pre approval waitlist flag on the bank account', async () => {
    account = await factory.create('bank-account');
    await account.update({ preApprovalWaitlist: moment() });

    sandbox.stub(AdvanceApprovalClient, 'createAdvanceApproval').resolves([SuccessResponse]);

    await request(app)
      .get('/v2/advance/terms')
      .set('Authorization', account.userId.toString())
      .set('X-Device-Id', account.userId.toString())
      .set('X-App-Version', '2.9.0')
      .query({ amount: 75, bank_account_id: account.id })
      .expect(200);

    await account.reload();
    expect(account.preApprovalWaitlist).to.be.null;
  });

  context('Predicted payback experiment', () => {
    const today = moment.tz('2020-03-20', 'YYYY-MM-DD', DEFAULT_TIMEZONE);

    beforeEach(async () => {
      predictedPaybackStub.restore();
      fakeDateTime(sandbox, today);
      await Payment.destroy({ where: { userId: 200 } });
      sandbox.stub(Jobs, 'broadcastAdvanceDisbursementTask');
    });

    [
      // ML request errors
      {
        predictionResults: { body: undefined, error: new Error('Some request error') },
        expectedAvailable: [
          '2020-03-24',
          '2020-03-25',
          '2020-03-26',
          '2020-03-27',
          '2020-03-30',
          '2020-03-31',
        ],
        expectedDefault: '2020-03-27',
      },
      // All dates are in the past
      {
        predictionResults: {
          data: {
            predictions: [
              { date: '2020-03-10', score: 0.62 },
              { date: '2020-03-11', score: 0.63 },
              { date: '2020-03-12', score: 0.64 },
              { date: '2020-03-13', score: 0.65 },
              { date: '2020-03-14', score: 0.66 },
              { date: '2020-03-15', score: 0.691 },
              { date: '2020-03-16', score: 0.75 },
              { date: '2020-03-17', score: 0.84 },
            ],
          },
          error: undefined,
        },
        expectedAvailable: [
          '2020-03-24',
          '2020-03-25',
          '2020-03-26',
          '2020-03-27',
          '2020-03-30',
          '2020-03-31',
        ],
        expectedDefault: '2020-03-27',
      },
      // 2020-03-29 is the winner (on a non-banking day)
      {
        predictionResults: {
          data: {
            predictions: [
              { date: '2020-03-24', score: 0.62 },
              { date: '2020-03-25', score: 0.63 },
              { date: '2020-03-26', score: 0.64 },
              { date: '2020-03-27', score: 0.65 },
              { date: '2020-03-28', score: 0.66 },
              { date: '2020-03-29', score: 0.691 },
              { date: '2020-03-30', score: 0.75 },
              { date: '2020-03-31', score: 0.84 },
            ],
          },
          error: undefined,
        },
        expectedAvailable: [
          '2020-03-24',
          '2020-03-25',
          '2020-03-26',
          '2020-03-27',
          '2020-03-29',
          '2020-03-30',
          '2020-03-31',
        ],
        expectedDefault: '2020-03-29',
      },
      // 2020-03-30 is the winner
      {
        predictionResults: {
          data: {
            predictions: [
              { date: '2020-03-24', score: 0.62 },
              { date: '2020-03-25', score: 0.63 },
              { date: '2020-03-26', score: 0.64 },
              { date: '2020-03-27', score: 0.65 },
              { date: '2020-03-28', score: 0.66 },
              { date: '2020-03-29', score: 0.68 },
              { date: '2020-03-30', score: 0.75 },
              { date: '2020-03-31', score: 0.84 },
            ],
          },
          error: undefined,
        },
        expectedAvailable: [
          '2020-03-24',
          '2020-03-25',
          '2020-03-26',
          '2020-03-27',
          '2020-03-30',
          '2020-03-31',
        ],
        expectedDefault: '2020-03-30',
      },
    ].forEach(({ predictionResults, expectedAvailable, expectedDefault }) => {
      it('should successfully approve a tiny money advance with a predicted default payback date', async () => {
        account = await factory.create('bank-account');
        const approval = await factory.create('advance-approval', {
          bankAccountId: account.id,
        });
        sandbox.stub(AdvanceApprovalClient, 'createAdvanceApproval').resolves([
          {
            ...SuccessResponse,
            advanceType: 'MICRO_ADVANCE',
            approvedAmounts: [5, 10, 15],
            defaultPaybackDate: expectedDefault,
            microAdvanceApproved: true,
            userId: account.userId,
            bankAccountId: account.id,
            approvalId: approval.id,
            rejectionReasons: [
              {
                type: 'bad-advance',
                message: 'Cheese',
              },
            ],
          },
        ]);

        const oracleBatchScorePaybackDateStub = sandbox
          .stub(ScoringApi.prototype, 'batchScorePaybackDate')
          .withArgs(
            PREDICTED_PAYBACK_MODEL_CONFIG.modelType,
            sinon.match({
              user_id: account.userId,
              bank_account_id: account.id,
              dates: sinon.match.array,
            }),
          );

        if (predictionResults.error) {
          oracleBatchScorePaybackDateStub.throws(predictionResults.error);
        } else {
          oracleBatchScorePaybackDateStub.returns(predictionResults);
        }

        const { body: advanceTermsBody } = await request(app)
          .get('/v2/advance/terms')
          .set('Authorization', account.userId.toString())
          .set('X-Device-Id', account.userId.toString())
          .set('X-App-Version', '2.9.0')
          .query({
            amount: 50,
            bank_account_id: account.id,
          });
        expect(advanceTermsBody.approved).to.equal(true);
        expect(advanceTermsBody.advanceType).to.equal('MICRO_ADVANCE');
        expect(advanceTermsBody.approvedAmounts).to.deep.equal([5, 10, 15]);
        expect(advanceTermsBody.income.date).to.equal(expectedDefault);
        expect(advanceTermsBody.paybackDates).to.deep.equal({
          available: expectedAvailable,
          default: expectedDefault,
        });
        expect(advanceTermsBody.type).to.exist;
        expect(advanceTermsBody.message).to.exist;
      });
    });
  });

  it('should send a $50 advance response w/ all the required data', async () => {
    account = await BankAccount.findByPk(2);
    const bankConnection = await account.getBankConnection();
    const bds = await generateBankingDataSource(bankConnection);
    sandbox.stub(bds, 'getBalance').resolves({
      externalId: account.externalId,
      available: 3,
      current: 3,
    });
    sandbox.stub(AdvanceApprovalClient, 'createAdvanceApproval').resolves([SuccessResponse]);

    return request(app)
      .get('/v2/advance/terms')
      .set('Authorization', 'token-3')
      .set('X-Device-Id', 'id-3')
      .set('X-App-Version', '2.9.0')
      .query({ amount: 50, bank_account_id: 2 })
      .expect(200)
      .then(res => {
        expect(res.body.approved).to.equal(true);
        expect(res.body.fees.express).to.equal(3.99);
      });
  });

  it('should send the advance engine description rules as passing on a success w/ all required data', async () => {
    const user = await factory.create<User>('user');
    const bankAccount = await factory.create<BankAccount>('bank-account', {
      userId: user.id,
      microDeposit: MicroDeposit.COMPLETED,
    });
    await sandbox.stub(AdvanceApprovalClient, 'createAdvanceApproval').resolves([
      {
        ...SuccessResponse,
        advanceEngineRuleDescriptions: {
          passed: [
            'I get paid in the account I connected',
            'My account currently has a positive balance',
            'My bank account is at least a few months old',
            "I've gotten multiple paychecks deposited from the same employer on a regular schedule",
            'My paychecks average at least a few hundred dollars',
            'I keep enough money in my account for a few days after payday to pay a few bills',
          ],
          failed: [],
          pending: [],
        },
      },
    ]);

    return request(app)
      .get('/v2/advance/terms')
      .set('Authorization', `${user.id}`)
      .set('X-Device-Id', `${user.id}`)
      .set('X-App-Version', '2.9.0')
      .query({ amount: 50, bank_account_id: bankAccount.id })
      .expect(200)
      .then(res => {
        expect(res.body.advanceEngineRuleDescriptions).to.be.deep.eq({
          passed: [
            'I get paid in the account I connected',
            'My account currently has a positive balance',
            'My bank account is at least a few months old',
            "I've gotten multiple paychecks deposited from the same employer on a regular schedule",
            'My paychecks average at least a few hundred dollars',
            'I keep enough money in my account for a few days after payday to pay a few bills',
          ],
          failed: [],
          pending: [],
        });
      });
  });

  it('should return a single rejected approval on failure for showAllResults=true', async () => {
    const bankAccount = await factory.create('checking-account');
    sandbox
      .stub(AdvanceApprovalClient, 'createAdvanceApproval')
      .resolves([FailureResponse, FailureResponse]);

    const result = await request(app)
      .get('/v2/advance/terms')
      .set('Authorization', bankAccount.userId.toString())
      .set('X-Device-Id', bankAccount.userId.toString())
      .set('X-App-Version', '2.9.0')
      .query({ bank_account_id: bankAccount.id, showAllResults: true, amount: 50 })
      .expect(200);
    expect(result.body.length).to.equal(1);
    expect(result.body[0].approved).to.equal(false);
    expect(result.body[0].approvedAmounts).to.not.exist;
    expect(result.body[0].message).to.exist;
    expect(result.body[0].type).to.exist;
  });

  it('should omit any rejected approvals from successful response', async () => {
    const bankAccount = await factory.create('checking-account');
    sandbox
      .stub(AdvanceApprovalClient, 'createAdvanceApproval')
      .resolves([SuccessResponse, FailureResponse]);

    const result = await request(app)
      .get('/v2/advance/terms')
      .set('Authorization', bankAccount.userId.toString())
      .set('X-Device-Id', bankAccount.userId.toString())
      .set('X-App-Version', '2.9.0')
      .query({ amount: 50, bank_account_id: bankAccount.id, showAllResults: true });
    expect(result.status).to.equal(200);
  });
});
