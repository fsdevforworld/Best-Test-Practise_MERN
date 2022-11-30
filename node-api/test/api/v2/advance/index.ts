import * as Loomis from '@dave-inc/loomis-client';
import { PaymentGateway } from '@dave-inc/loomis-client';
import {
  AdvanceDelivery,
  AdvanceNetwork,
  BankingDataSource,
  DonationOrganizationCode,
  ExternalTransactionProcessor,
  ExternalTransactionStatus,
  PaymentProviderDelivery,
} from '@dave-inc/wire-typings';
import { expect } from 'chai';
import { Moment } from 'moment';
import * as sinon from 'sinon';
import * as request from 'supertest';
import * as uuid from 'uuid';
import * as devSeed from '../../../../bin/dev-seed';
import app from '../../../../src/api';
import { DONATION_ORG_OPTIONS_APP_VERSION, MIN_VERSION } from '../../../../src/api/v2/advance';
import * as SynapsepayModels from '../../../../src/domain/synapsepay/external-model-definitions';
import SynapsepayNodeLib from '../../../../src/domain/synapsepay/node';
import * as Jobs from '../../../../src/jobs/data';
import { nextBankingDay } from '../../../../src/lib/banking-days';
import { ApprovalNotFoundError, CUSTOM_ERROR_CODES } from '../../../../src/lib/error';
import gcloudStorage from '../../../../src/lib/gcloud-storage';
import { moment } from '@dave-inc/time-lib';
import sendgrid from '../../../../src/lib/sendgrid';
import * as Tabapay from '../../../../src/lib/tabapay';
import twilio from '../../../../src/lib/twilio';
import * as Utils from '../../../../src/lib/utils';
import {
  AdminPaycheckOverride,
  Advance,
  BankAccount,
  SynapsepayDocument,
  User,
  UserSession,
} from '../../../../src/models';
import AdvanceTip from '../../../../src/models/advance-tip';
import {
  IdentityVerificationError,
  PaymentProviderTransactionType,
  Platforms,
  SynapsepayDocumentSSNStatus,
  SynapsepayDocumentPermission,
} from '../../../../src/typings';
import factory from '../../../factories';
import advanceSchema from '../../../schema/advance';
import {
  clean,
  mockGCloudStorageUrl,
  replayHttp,
  stubAdvanceApprovalSideEffects,
  stubBalanceLogClient,
  stubLoomisClient,
  stubPredictedPaybackML,
  stubUnderwritingML,
  TABAPAY_ACCOUNT_ID,
  up,
} from '../../../test-helpers';
import { generateBankingDataSource } from '../../../../src/domain/banking-data-source';
import stubBankTransactionClient from '../../../test-helpers/stub-bank-transaction-client';
import { insertFixtureBankTransactions } from '../../../test-helpers/bank-transaction-fixtures';
import AdvanceApprovalClient from '../../../../src/lib/advance-approval-client';
import DonationOrganization from '../../../../src/models/donation-organization';

describe('/v2/advance/*', () => {
  const sandbox = sinon.createSandbox();

  const minVersion = MIN_VERSION;
  const advanceEndpoint = '/v2/advance';
  before(() => clean());

  // insert user and user_session data
  beforeEach(() => {
    sandbox.stub(twilio, 'send').resolves();
    sandbox.stub(sendgrid, 'send').resolves();
    stubBalanceLogClient(sandbox);
    stubLoomisClient(sandbox);
    stubUnderwritingML(sandbox, { score: 0 });
    stubPredictedPaybackML(sandbox);
    stubAdvanceApprovalSideEffects(sandbox);
    stubBankTransactionClient(sandbox);
  });

  afterEach(() => clean(sandbox));

  context('Tests that require fixture', () => {
    let broadcastAdvanceDisbursementJobStub: sinon.SinonStub;
    let donationOrganization: DonationOrganization;

    beforeEach(async () => {
      broadcastAdvanceDisbursementJobStub = sandbox.stub(Jobs, 'broadcastAdvanceDisbursementTask');
      donationOrganization = await factory.create('donation-organization', {
        code: DonationOrganizationCode.TREES,
      });
      insertFixtureBankTransactions();
      return up();
    });

    describe('POST /advance', () => {
      it('should ask for update if X-App-Version < 2.9.0', async () => {
        const result = await request(app)
          .post('/v2/advance')
          .set('Authorization', 'token-3')
          .set('X-Device-Id', 'id-3')
          .set('X-App-Version', '2.8.0')
          .send({});

        expect(result.status).to.equal(400);
        expect(result.body.message).to.match(/Please update/);
      });

      it('should fail if the amount is invalid', async () => {
        const data = {
          amount: 'foobar',
          bank_account_id: 1,
        };

        return request(app)
          .post(advanceEndpoint)
          .set('Authorization', 'token-3')
          .set('X-Device-Id', 'id-3')
          .set('X-App-Version', minVersion)
          .send(data)
          .expect(400)
          .then(res => {
            expect(res.body.message).to.match(/Invalid advance amount/);
          });
      });

      it('should fail if the bank account does not belong to the user', () => {
        const data = {
          bank_account_id: 50,
          amount: 50,
        };

        return request(app)
          .post(advanceEndpoint)
          .set('Authorization', 'token-3')
          .set('X-Device-Id', 'id-3')
          .set('X-App-Version', minVersion)
          .send(data)
          .expect(400)
          .then(res => {
            expect(res.body.message).to.match(/Bank Account not found/);
          });
      });

      it('should fail if the payment method is close to expiration', () => {
        const data = {
          bank_account_id: 3,
          amount: 50,
        };

        return request(app)
          .post(advanceEndpoint)
          .set('Authorization', 'token-3')
          .set('X-Device-Id', 'id-3')
          .set('X-App-Version', minVersion)
          .send(data)
          .expect(400)
          .then(res => {
            expect(res.body.message).to.match(/expires in less than two months/);
            expect(res.body.customCode).to.equal(
              CUSTOM_ERROR_CODES.ADVANCE_PAYMENT_METHOD_EXPIRING_SOON,
            );
          });
      });

      [
        {
          synapsepayDocument: null,
          expectedErrorMessage: 'Identity verification is required to take out an advance',
        },
        {
          synapsepayDocument: { ssnStatus: SynapsepayDocumentSSNStatus.Reviewing },
          expectedErrorMessage: 'Identity documents are still under review',
        },
        {
          synapsepayDocument: { licenseStatus: SynapsepayDocumentSSNStatus.Reviewing },
          expectedErrorMessage: 'Identity documents are still under review',
        },
        {
          synapsepayDocument: {
            licenseStatus: null,
            ssnStatus: SynapsepayDocumentSSNStatus.Invalid,
          },
          expectedErrorMessage: 'Please upload license',
        },
        {
          synapsepayDocument: {
            licenseStatus: SynapsepayDocumentSSNStatus.Invalid,
            ssnStatus: SynapsepayDocumentSSNStatus.Invalid,
          },
          expectedErrorMessage: 'Please upload license',
        },
      ].forEach(({ synapsepayDocument, expectedErrorMessage }) => {
        it('should throw a 400 with error message if unable to verify user identification', async () => {
          const bankAccount = await factory.create('bank-account');
          const userSession = await factory.create('user-session', {
            userId: bankAccount.userId,
          });

          if (synapsepayDocument) {
            await factory.create('synapsepay-document', {
              ...synapsepayDocument,
              userId: userSession.userId,
            });
          }

          const { body } = await request(app)
            .post(advanceEndpoint)
            .set('Authorization', userSession.token)
            .set('X-Device-Id', userSession.deviceId)
            .set('X-App-Version', minVersion)
            .send({ bank_account_id: bankAccount.id, amount: 50 })
            .expect(400);

          expect(body.message).to.contain(expectedErrorMessage);
        });
      });

      it('should skip identity verification for BoD account', async () => {
        const amount = 50;
        const bankOfDaveStub = sandbox.stub().resolves({
          externalId: 'cash money',
          status: ExternalTransactionStatus.Completed,
          processor: ExternalTransactionProcessor.BankOfDave,
        });
        sandbox
          .stub(Loomis, 'getPaymentGateway')
          .withArgs(PaymentGateway.BankOfDave)
          .returns({ createTransaction: bankOfDaveStub });

        const bankAccount = await factory.create('bod-checking-account');
        await SynapsepayDocument.update(
          { permission: SynapsepayDocumentPermission.Closed },
          { where: { userId: bankAccount.userId } },
        );

        const recurringTransaction = await factory.create('recurring-transaction', {
          userId: bankAccount.userId,
          bankAccountId: bankAccount.id,
          userAmount: 1000,
        });

        const approval = await factory.create('advance-approval', {
          userId: bankAccount.userId,
          bankAccountId: bankAccount.id,
          approvedAmounts: [75, 50, 25],
          created: moment().subtract(1, 'minute'),
          recurringTransactionId: recurringTransaction.id,
          defaultPaybackDate: moment().add(7, 'days'),
        });

        sandbox.stub(AdvanceApprovalClient, 'getAdvanceApproval').resolves(approval);

        const { body } = await request(app)
          .post(advanceEndpoint)
          .set('Authorization', `${bankAccount.userId}`)
          .set('X-Device-Id', `${bankAccount.userId}`)
          .set('X-App-Version', minVersion)
          .send({
            bank_account_id: bankAccount.id,
            amount,
          })
          .expect(200);

        const advance = await Advance.findByPk(body.id);

        expect(advance.bankAccountId).to.equal(bankAccount.id);
        expect(advance.amount).to.eq(50);
        expect(body.amount).to.eq(amount);
        expect(body.tip).to.eq(0);
        expect(body.tipPercent).to.eq(0);
        expect(body.donationOrganization).to.eq(DonationOrganizationCode.TREES);
        sinon.assert.calledOnce(bankOfDaveStub);
      });

      it("should fail if a matching /terms advance approval can't be found", () => {
        sandbox.stub(Tabapay, 'disburse').resolves({
          status: ExternalTransactionStatus.Completed,
          id: 1,
          processor: ExternalTransactionProcessor.Tabapay,
        });
        sandbox.stub(SynapsepayModels.nodes, 'getAsync').resolves({});
        sandbox.stub(SynapsepayModels.users, 'getAsync').resolves({});

        const data = {
          bank_account_id: 2,
          amount: 50,
        };

        sandbox
          .stub(AdvanceApprovalClient, 'getAdvanceApproval')
          .rejects(new ApprovalNotFoundError());

        return request(app)
          .post(advanceEndpoint)
          .set('Authorization', 'token-3')
          .set('X-Device-Id', 'id-3')
          .set('X-App-Version', minVersion)
          .send(data)
          .expect(400)
          .then(res => {
            expect(res.body.message).to.contain(
              'Your advance eligibility has changed. Please reapply by starting over',
            );
            expect(res.body.customCode).to.equal(CUSTOM_ERROR_CODES.ADVANCE_CHANGE_IN_ELIGIBILITY);
          });
      });

      it('should fail if the payback date is in the past', async () => {
        sandbox.stub(SynapsepayModels.nodes, 'getAsync').resolves({});
        sandbox.stub(SynapsepayModels.users, 'getAsync').resolves({});

        const data = {
          bank_account_id: 2,
          amount: 75,
          paybackDate: moment()
            .subtract(1, 'day')
            .format('YYYY-MM-DD'),
        };

        sandbox.stub(AdvanceApprovalClient, 'getAdvanceApproval').resolves(
          await factory.build('advance-approval', {
            bankAccountId: 2,
            userId: 3,
            defaultPaybackDate: moment().subtract(2, 'day'),
          }),
        );

        const result = await request(app)
          .post(advanceEndpoint)
          .set('Authorization', 'token-3')
          .set('X-Device-Id', 'id-3')
          .set('X-App-Version', minVersion)
          .expect(400)
          .send(data);

        const { body: customError } = result;
        expect(customError.message).to.include('Payback Date must be in the future.');
        expect(customError.data).not.to.be.null;
      });

      it('should fail if the default account is soft-deleted', async () => {
        const connection = await factory.create('bank-connection');
        const user = await connection.getUser();

        const account = await factory.create('bank-account', {
          lastFour: '1111',
          bankConnectionId: connection.id,
          userId: user.id,
          subtype: 'CHECKING',
        });

        const recurringTransaction = await factory.create('recurring-transaction', {
          bankAccountId: account.id,
          userId: user.id,
        });

        const data = {
          bank_account_id: account.id,
          amount: 75,
          recurringTransactionId: recurringTransaction.id,
        };

        await user.update({ defaultBankAccountId: account.id });

        await account.destroy();

        const session = await UserSession.findOne({ where: { userId: user.id } });

        const result = await request(app)
          .post(`/v2/advance`)
          .set('Authorization', session.token)
          .set('X-Device-Id', session.deviceId)
          .set('X-App-Version', minVersion)
          .send(data);

        const { status: httpStatus, body: customError } = result;

        expect(httpStatus).to.equal(400);
        expect(customError.message).to.include(
          'I lost connection to your default bank account. Please update your profile to add or select a different default account',
        );
        expect(customError.customCode).to.equal(CUSTOM_ERROR_CODES.DEFAULT_ACCOUNT_REMOVED);
      });

      it('should attempt to disburse the advance and fail if disbursement fails', async () => {
        sandbox.stub(Tabapay, 'disburse').resolves({
          status: ExternalTransactionStatus.Unknown,
          id: 1,
          processor: ExternalTransactionProcessor.Tabapay,
        });
        sandbox.stub(SynapsepayModels.nodes, 'getAsync').resolves({});
        sandbox.stub(SynapsepayModels.users, 'getAsync').resolves({});

        const data = {
          bank_account_id: 2,
          amount: 50,
        };

        sandbox.stub(AdvanceApprovalClient, 'getAdvanceApproval').resolves(
          await factory.build('advance-approval', {
            bankAccountId: 2,
            userId: 3,
            defaultPaybackDate: moment().add(2, 'day'),
          }),
        );

        await request(app)
          .post(advanceEndpoint)
          .set('Authorization', 'token-3')
          .set('X-Device-Id', 'id-3')
          .set('X-App-Version', minVersion)
          .send(data)
          .expect(424)
          .then(res => {
            expect(res.body.message).to.match(/Failed to process transaction/);
          });

        const advance = await Advance.findOne({
          where: { userId: 3 },
          order: [['created', 'desc']],
          paranoid: false,
        });
        expect(advance).not.to.be.null;
        expect(advance.disbursementStatus).to.eq(ExternalTransactionStatus.Unknown);
        expect(advance.externalId).to.eq('1');
        expect(advance.disbursementProcessor).to.eq(ExternalTransactionProcessor.Tabapay);
      });

      it(
        'should fail with customErrorCode when TabapayRequestTransactionStatus is Error during disbursement',
        replayHttp('tabapay/transaction-status-error.json', async () => {
          const user = await factory.create('user');
          const tabapayId = TABAPAY_ACCOUNT_ID;
          const bankConnection = await factory.create('bank-connection', { userId: user.id });
          const paymentMethod = await factory.create('payment-method', {
            userId: user.id,
            tabapayId,
          });
          const bankAccount = await factory.create('bank-account', {
            defaultPaymentMethodId: paymentMethod.id,
            bankConnectionId: bankConnection.id,
            userId: user.id,
          });
          const recurringTransaction = await factory.create('recurring-transaction', {
            userId: user.id,
            bankAccountId: bankAccount.id,
            userAmount: 1000,
          });
          await factory.create('synapsepay-document', { userId: user.id });
          const paybackDate = moment().add(7, 'days');
          sandbox.stub(AdvanceApprovalClient, 'getAdvanceApproval').resolves(
            await factory.create('advance-approval', {
              userId: user.id,
              bankAccountId: bankAccount.id,
              approvedAmounts: [75, 50, 25],
              created: moment().subtract(1, 'minute'),
              recurringTransactionId: recurringTransaction.id,
              defaultPaybackDate: paybackDate,
            }),
          );

          sandbox.stub(Utils, 'generateRandomHexString').returns('error-push');
          const data = {
            bank_account_id: bankAccount.id,
            amount: 0.01,
            recurringTransactionId: recurringTransaction.id,
            delivery: PaymentProviderDelivery.EXPRESS,
            tip_percent: '10',
            paybackDate: paybackDate.format(),
          };
          const res = await request(app)
            .post(advanceEndpoint)
            .set('Authorization', user.id)
            .set('X-Device-Id', user.id)
            .set('X-App-Version', minVersion)
            .send(data);
          expect(res.status).to.equal(424);
          expect(res.body.customCode).to.equal(CUSTOM_ERROR_CODES.BANK_DENIED_CARD);
          expect(res.body.message).to.match(
            /Card entry declined. Please check that your debit card information is correct and try again./,
          );
        }),
      );

      it('should fail and set status to canceled on an unknown error', async () => {
        sandbox.stub(Tabapay, 'disburse').rejects(new Error('bacon'));

        const data = {
          bank_account_id: 2,
          amount: 50,
        };

        // Creates advance approval objects.
        sandbox.stub(AdvanceApprovalClient, 'getAdvanceApproval').resolves(
          await factory.build('advance-approval', {
            bankAccountId: 2,
            userId: 3,
            defaultPaybackDate: moment().add(2, 'day'),
          }),
        );

        await request(app)
          .post(advanceEndpoint)
          .set('Authorization', 'token-3')
          .set('X-Device-Id', 'id-3')
          .set('X-App-Version', minVersion)
          .send(data)
          .expect(500);

        const advance = await Advance.findOne({
          where: { userId: 3 },
          order: [['created', 'desc']],
          paranoid: false,
        });

        expect(advance).not.to.be.null;
        expect(advance.disbursementStatus).to.eq(ExternalTransactionStatus.Canceled);
      });

      it('should disburse an express advance and return a valid advance object', async () => {
        const network: AdvanceNetwork = {
          approvalCode: '123789',
          networkId: '4987524624',
          settlementNetwork: 'Visa',
        };
        sandbox.stub(Tabapay, 'disburse').resolves({
          status: ExternalTransactionStatus.Completed,
          id: 1,
          processor: ExternalTransactionProcessor.Tabapay,
          network,
        });
        sandbox.stub(SynapsepayModels.nodes, 'getAsync').resolves({});
        sandbox.stub(SynapsepayModels.users, 'getAsync').resolves({});

        sandbox.stub(AdvanceApprovalClient, 'getAdvanceApproval').resolves(
          await factory.build('advance-approval', {
            bankAccountId: 2,
            userId: 3,
            defaultPaybackDate: moment().add(2, 'day'),
          }),
        );

        const data = {
          bank_account_id: 2,
          amount: 50,
          donationOrganization: donationOrganization.code,
        };

        return request(app)
          .post(advanceEndpoint)
          .set('Authorization', 'token-3')
          .set('X-Device-Id', 'id-3')
          .set('X-App-Version', minVersion)
          .send(data)
          .expect(200)
          .then(res => {
            expect(res.body.amount).to.equal(50);
            expect(res.body.fee).to.equal(3.99);
            expect(res.body.tip).to.equal(2.5);
            expect(res.body.tipPercent).to.equal(5);
            expect(res.body.donationOrganization).to.equal(DonationOrganizationCode.TREES);
            expect(res.body.outstanding).to.equal(56.49);
            expect(res.body.destination.lastFour).to.equal('4112');
            expect(res.body.destination.displayName).to.equal('Chase Visa: 4112');
            expect(res.body.destination.scheme).to.equal('visa');
            expect(res.body.network.approvalCode).to.equal(network.approvalCode);
            expect(res.body.network.networkId).to.equal(network.networkId);
            expect(res.body.network.settlementNetwork).to.equal(network.settlementNetwork);
          });
      });
      it('should save the reference ID on the advance and pass it to the payment processor', async () => {
        const risepayStub = sandbox.stub(Tabapay, 'disburse').resolves({
          status: ExternalTransactionStatus.Completed,
          id: 1,
          processor: ExternalTransactionProcessor.Tabapay,
        });
        sandbox.stub(SynapsepayModels.nodes, 'getAsync').resolves({});
        sandbox.stub(SynapsepayModels.users, 'getAsync').resolves({});

        sandbox.stub(AdvanceApprovalClient, 'getAdvanceApproval').resolves(
          await factory.build('advance-approval', {
            bankAccountId: 2,
            userId: 3,
            defaultPaybackDate: moment().add(2, 'day'),
          }),
        );

        const data = {
          bank_account_id: 2,
          amount: 50,
          donationOrganization: donationOrganization.code,
        };

        const result = await request(app)
          .post(advanceEndpoint)
          .set('Authorization', 'token-3')
          .set('X-Device-Id', 'id-3')
          .set('X-App-Version', minVersion)
          .send(data)
          .expect(200);

        const advance = await Advance.findByPk(result.body.id);

        expect(result.body.tip).to.equal(2.5);
        expect(result.body.tipPercent).to.equal(5);
        expect(result.body.donationOrganization).to.equal(DonationOrganizationCode.TREES);

        expect(risepayStub.firstCall.args[0]).to.equal(advance.referenceId);
      });

      it('queues a background job to send disbursement info to analytics partners', async () => {
        sandbox.stub(Tabapay, 'disburse').resolves({
          status: ExternalTransactionStatus.Completed,
          id: 1,
          processor: ExternalTransactionProcessor.Tabapay,
        });
        sandbox.stub(SynapsepayModels.nodes, 'getAsync').resolves({});
        sandbox.stub(SynapsepayModels.users, 'getAsync').resolves({});

        // Creates advance approval objects.
        const data = {
          bank_account_id: 2,
          amount: 50,
          donationOrganization: donationOrganization.code,
        };

        sandbox.stub(AdvanceApprovalClient, 'getAdvanceApproval').resolves(
          await factory.build('advance-approval', {
            bankAccountId: 2,
            userId: 3,
            defaultPaybackDate: moment().add(2, 'day'),
          }),
        );

        const appsflyerDeviceId = 'some-appsflyer-id';
        const platform = Platforms.Android;
        const ip = 'some.ip';

        const response = await request(app)
          .post(advanceEndpoint)
          .set('Authorization', 'token-3')
          .set('X-Device-Id', 'id-3')
          .set('X-App-Version', minVersion)
          .set('X-AppsFlyer-ID', appsflyerDeviceId)
          .set('X-Device-Type', platform)
          .set('X-Forwarded-For', ip)
          .send(data)
          .expect(200);

        expect(response.body.tip).to.equal(2.5);
        expect(response.body.tipPercent).to.equal(5);
        expect(response.body.donationOrganization).to.equal(DonationOrganizationCode.TREES);
        expect(broadcastAdvanceDisbursementJobStub).to.be.calledWithExactly({
          advanceId: response.body.id,
          ip,
          appsflyerDeviceId,
          platform,
          userId: 3,
        });
      });

      it('should default the created_date to the current date', async () => {
        sandbox.stub(Tabapay, 'disburse').resolves({
          status: ExternalTransactionStatus.Completed,
          id: 1,
          processor: ExternalTransactionProcessor.Tabapay,
        });
        sandbox.stub(SynapsepayModels.nodes, 'getAsync').resolves({});
        sandbox.stub(SynapsepayModels.users, 'getAsync').resolves({});

        const data = {
          bank_account_id: 2,
          amount: 50,
        };

        sandbox.stub(AdvanceApprovalClient, 'getAdvanceApproval').resolves(
          await factory.build('advance-approval', {
            bankAccountId: 2,
            userId: 3,
            defaultPaybackDate: moment().add(2, 'day'),
          }),
        );

        return request(app)
          .post(advanceEndpoint)
          .set('Authorization', 'token-3')
          .set('X-Device-Id', 'id-3')
          .set('X-App-Version', minVersion)
          .send(data)
          .expect(200)
          .then(async res => {
            const advance = await Advance.findByPk(res.body.id);
            expect(res.body.tip).to.equal(2.5);
            expect(res.body.tipPercent).to.equal(5);
            expect(res.body.donationOrganization).to.equal(DonationOrganizationCode.TREES);
            expect(advance.createdDate.isSame(moment().startOf('day'))).to.be.true;
          });
      });

      context('when setting a tip with an advance request', () => {
        beforeEach(async () => {
          sandbox.stub(Tabapay, 'disburse').resolves({
            status: ExternalTransactionStatus.Completed,
            id: 1,
            processor: ExternalTransactionProcessor.Tabapay,
          });
          sandbox.stub(SynapsepayModels.nodes, 'getAsync').resolves({});
          sandbox.stub(SynapsepayModels.users, 'getAsync').resolves({});
        });

        it('should use zero tip if default is not set', async () => {
          const user = await User.findByPk(3);
          await user.update({ settings: {} });

          const data = {
            amount: 50,
            bank_account_id: 2,
            donationOrganization: DonationOrganizationCode.TREES,
          };

          sandbox.stub(AdvanceApprovalClient, 'getAdvanceApproval').resolves(
            await factory.build('advance-approval', {
              bankAccountId: 2,
              userId: 3,
              defaultPaybackDate: moment().add(2, 'day'),
            }),
          );

          return request(app)
            .post(advanceEndpoint)
            .set('Authorization', 'token-3')
            .set('X-Device-Id', 'id-3')
            .set('X-App-Version', minVersion)
            .send(data)
            .expect(200)
            .then(async res => {
              const advanceTip = await AdvanceTip.findOne({ where: { advanceId: res.body.id } });
              expect(res.body.amount).to.equal(50);
              expect(res.body.fee).to.equal(3.99);
              expect(res.body.tip).to.eq(0);
              expect(res.body.tipPercent).to.equal(0);
              expect(res.body.outstanding).to.equal(53.99);
              expect(res.body.donationOrganization).to.eq(DonationOrganizationCode.TREES);
              expect(advanceTip.amount).to.equal(0);
              expect(advanceTip.percent).to.equal(0);
              expect(advanceTip.donationOrganizationId).to.equal(donationOrganization.id);
            });
        });

        it('should use default tip if it is set', async () => {
          const user = await factory.create('user', { settings: { default_tip: 10 } });
          const bankConnection = await factory.create('bank-connection', { userId: user.id });
          const bankAccount = await factory.create('bank-account', {
            bankConnectionId: bankConnection.id,
            userId: user.id,
          });
          const paymentMethod = await factory.create('payment-method', {
            bankAccountId: bankAccount.id,
          });
          await bankAccount.update({ defaultPaymentMethodId: paymentMethod.id });
          await factory.create('synapsepay-document', { userId: user.id });
          await factory.create('big-money-advance-approval', {
            userId: user.id,
            bankAccountId: bankAccount.id,
            normalAdvanceApproved: true,
          });

          const data = {
            amount: 50,
            bank_account_id: bankAccount.id,
            donationOrganization: DonationOrganizationCode.TREES,
          };

          sandbox.stub(AdvanceApprovalClient, 'getAdvanceApproval').resolves(
            await factory.build('advance-approval', {
              bankAccountId: 2,
              userId: 3,
              defaultPaybackDate: moment().add(2, 'day'),
            }),
          );
          return request(app)
            .post(advanceEndpoint)
            .set('Authorization', user.id)
            .set('X-Device-Id', user.id)
            .set('X-App-Version', minVersion)
            .send(data)
            .expect(200)
            .then(async res => {
              const advanceTip = await AdvanceTip.findOne({ where: { advanceId: res.body.id } });
              expect(res.body.amount).to.equal(50);
              expect(res.body.fee).to.equal(3.99);
              expect(res.body.tip).to.equal(5);
              expect(res.body.tipPercent).to.equal(10);
              expect(res.body.outstanding).to.equal(58.99);
              expect(advanceTip.amount).to.equal(5);
              expect(advanceTip.percent).to.equal(10);
              expect(advanceTip.donationOrganizationId).to.equal(donationOrganization.id);
            });
        });

        it('should use explicit positive tip instead of default', async () => {
          const data = {
            amount: 50,
            bank_account_id: 2,
            tip_percent: 20,
            donationOrganization: DonationOrganizationCode.TREES,
          };

          sandbox.stub(AdvanceApprovalClient, 'getAdvanceApproval').resolves(
            await factory.build('advance-approval', {
              bankAccountId: 2,
              userId: 3,
              defaultPaybackDate: moment().add(2, 'day'),
            }),
          );

          return request(app)
            .post(advanceEndpoint)
            .set('Authorization', 'token-3')
            .set('X-Device-Id', 'id-3')
            .set('X-App-Version', minVersion)
            .send(data)
            .expect(200)
            .then(async res => {
              const advanceTip = await AdvanceTip.findOne({ where: { advanceId: res.body.id } });
              expect(res.body.amount).to.equal(50);
              expect(res.body.fee).to.equal(3.99);
              expect(res.body.tipPercent).to.equal(20);
              expect(res.body.outstanding).to.equal(63.99);
              expect(advanceTip.amount).to.equal(10);
              expect(advanceTip.percent).to.equal(20);
              expect(advanceTip.donationOrganizationId).to.equal(donationOrganization.id);
            });
        });

        it('should use explicit zero tip instead of default', async () => {
          const data = {
            amount: 50,
            bank_account_id: 2,
            tip_percent: 0,
            donationOrganization: DonationOrganizationCode.TREES,
          };

          sandbox.stub(AdvanceApprovalClient, 'getAdvanceApproval').resolves(
            await factory.build('advance-approval', {
              bankAccountId: 2,
              userId: 3,
              defaultPaybackDate: moment().add(2, 'day'),
            }),
          );

          return request(app)
            .post(advanceEndpoint)
            .set('Authorization', 'token-3')
            .set('X-Device-Id', 'id-3')
            .set('X-App-Version', minVersion)
            .send(data)
            .expect(200)
            .then(async res => {
              const advanceTip = await AdvanceTip.findOne({ where: { advanceId: res.body.id } });
              expect(res.body.amount).to.equal(50);
              expect(res.body.fee).to.equal(3.99);
              expect(res.body.tipPercent).to.equal(0);
              expect(res.body.outstanding).to.equal(53.99);
              expect(advanceTip.amount).to.equal(0);
              expect(advanceTip.percent).to.equal(0);
              expect(advanceTip.donationOrganizationId).to.equal(donationOrganization.id);
            });
        });

        it('should default donation org to trees for early app version', async () => {
          const data = {
            amount: 50,
            bank_account_id: 2,
            tip_percent: 0,
          };

          sandbox.stub(AdvanceApprovalClient, 'getAdvanceApproval').resolves(
            await factory.build('advance-approval', {
              bankAccountId: 2,
              userId: 3,
              defaultPaybackDate: moment().add(2, 'day'),
            }),
          );

          return request(app)
            .post(advanceEndpoint)
            .set('Authorization', 'token-3')
            .set('X-Device-Id', 'id-3')
            .set('X-App-Version', '2.10.3')
            .send(data)
            .expect(200)
            .then(async res => {
              const advanceTip = await AdvanceTip.findOne({ where: { advanceId: res.body.id } });
              expect(advanceTip.donationOrganizationId).to.equal(donationOrganization.id);
            });
        });

        it('should set specified donation orgnaization id', async () => {
          const data = {
            amount: 50,
            bank_account_id: 2,
            tip_percent: 0,
            donationOrganization: DonationOrganizationCode.FEEDING_AMERICA,
          };
          const newOrg = await factory.create('donation-organization', {
            code: DonationOrganizationCode.FEEDING_AMERICA,
          });

          sandbox.stub(AdvanceApprovalClient, 'getAdvanceApproval').resolves(
            await factory.build('advance-approval', {
              bankAccountId: 2,
              userId: 3,
              defaultPaybackDate: moment().add(2, 'day'),
            }),
          );

          return request(app)
            .post(advanceEndpoint)
            .set('Authorization', 'token-3')
            .set('X-Device-Id', 'id-3')
            .set('X-App-Version', DONATION_ORG_OPTIONS_APP_VERSION)
            .send(data)
            .expect(200)
            .then(async res => {
              const advanceTip = await AdvanceTip.findOne({ where: { advanceId: res.body.id } });
              expect(advanceTip.donationOrganizationId).to.equal(newOrg.id);
            });
        });

        it('should return UNKNOWN organization ofr no organization before version 2.12.5', async () => {
          const data = {
            amount: 50,
            bank_account_id: 2,
            tip_percent: 0,
          };
          const org = await factory.create('donation-organization', {
            code: DonationOrganizationCode.UNKNOWN,
          });

          sandbox.stub(AdvanceApprovalClient, 'getAdvanceApproval').resolves(
            await factory.build('advance-approval', {
              bankAccountId: 2,
              userId: 3,
              defaultPaybackDate: moment().add(2, 'day'),
            }),
          );

          return request(app)
            .post(advanceEndpoint)
            .set('Authorization', 'token-3')
            .set('X-Device-Id', 'id-3')
            .set('X-App-Version', '2.12.4')
            .send(data)
            .expect(200)
            .then(async res => {
              const advanceTip = await AdvanceTip.findOne({ where: { advanceId: res.body.id } });
              expect(advanceTip.donationOrganizationId).to.equal(org.id);
            });
        });

        it('should not define organization id for tiny money before version 2.12.5', async () => {
          const data = {
            amount: 15,
            bank_account_id: 2,
            tip_percent: 0,
          };

          sandbox.stub(AdvanceApprovalClient, 'getAdvanceApproval').resolves(
            await factory.build('advance-approval', {
              bankAccountId: 2,
              userId: 3,
              defaultPaybackDate: moment().add(2, 'day'),
            }),
          );

          return request(app)
            .post(advanceEndpoint)
            .set('Authorization', 'token-3')
            .set('X-Device-Id', 'id-3')
            .set('X-App-Version', '2.12.4')
            .send(data)
            .expect(200)
            .then(async res => {
              const advanceTip = await AdvanceTip.findOne({ where: { advanceId: res.body.id } });
              expect(advanceTip.donationOrganizationId).to.be.null;
            });
        });
      });

      it('multiple requests should create only one advance', async () => {
        sandbox
          .stub(Tabapay, 'disburse')
          .onFirstCall()
          .resolves({
            status: ExternalTransactionStatus.Completed,
            id: 1,
            processor: ExternalTransactionProcessor.Risepay,
          })
          .onSecondCall()
          .resolves({
            status: ExternalTransactionStatus.Completed,
            id: 2,
            processor: ExternalTransactionProcessor.Risepay,
          });
        sandbox.stub(SynapsepayModels.nodes, 'getAsync').resolves({});
        sandbox.stub(SynapsepayModels.users, 'getAsync').resolves({});

        const data = {
          bank_account_id: 2,
          amount: 50,
          donationOrganization: donationOrganization.code,
        };

        sandbox.stub(AdvanceApprovalClient, 'getAdvanceApproval').resolves(
          await factory.build('advance-approval', {
            bankAccountId: 2,
            userId: 3,
            defaultPaybackDate: moment().add(2, 'day'),
          }),
        );

        const p1 = request(app)
          .post(advanceEndpoint)
          .set('Authorization', 'token-3')
          .set('X-Device-Id', 'id-3')
          .set('X-App-Version', minVersion)
          .send(data);

        const p2 = request(app)
          .post(advanceEndpoint)
          .set('Authorization', 'token-3')
          .set('X-Device-Id', 'id-3')
          .set('X-App-Version', minVersion)
          .send(data);

        return Promise.all([p1, p2]).then(([a, b]) => {
          let good: any;
          let bad: any;
          if (a.body.id) {
            good = a;
            bad = b;
          } else {
            good = b;
            bad = a;
          }

          expect(good.status).to.equal(200);
          expect(good.body.amount).to.equal(50);
          expect(good.body.fee).to.equal(3.99);
          expect(good.body.tip).to.eq(2.5);
          expect(good.body.tipPercent).to.equal(5);
          expect(good.body.outstanding).to.equal(56.49);
          expect(good.body.donationOrganization).to.eq(DonationOrganizationCode.TREES);

          expect(bad.status).to.equal(400);
          expect(bad.body.customCode).to.equal(CUSTOM_ERROR_CODES.ADVANCE_ONE_AT_A_TIME);
        });
      });

      it('should fail when paycheck id is not approved for an advance', async () => {
        sandbox.stub(Tabapay, 'disburse').resolves({
          status: ExternalTransactionStatus.Completed,
          id: 1,
          processor: ExternalTransactionProcessor.Tabapay,
        });
        sandbox.stub(SynapsepayModels.nodes, 'getAsync').resolves({});
        sandbox.stub(SynapsepayModels.users, 'getAsync').resolves({});

        await devSeed.main('up', ['secondary-income']);
        const phoneNumber = '+11234577777';
        const user = await User.findOne({ where: { phoneNumber } });
        const bankAccount = await BankAccount.findOne({ where: { userId: user.id } });

        // Not eligible for an advance.
        const recurringTransaction = await factory.create('recurring-transaction', {
          bankAccountId: bankAccount.id,
          interval: 'MONTHLY',
          params: [((moment().date() + 24) % 28) + 1],
          userAmount: 10,
          userId: user.id,
        });

        const data = {
          bank_account_id: bankAccount.id,
          amount: 75,
          recurringTransactionId: recurringTransaction.id,
        };

        sandbox
          .stub(AdvanceApprovalClient, 'getAdvanceApproval')
          .rejects(new ApprovalNotFoundError());

        const result = await request(app)
          .post(advanceEndpoint)
          .set('Authorization', user.id.toString())
          .set('X-Device-Id', user.id.toString())
          .set('X-App-Version', minVersion)
          .send(data);
        expect(result.status).to.equal(400);
        expect(result.body.message).to.match(/Your advance eligibility has changed/);
        expect(result.body.customCode).to.equal(CUSTOM_ERROR_CODES.ADVANCE_CHANGE_IN_ELIGIBILITY);
      });

      context('when using a user-specified payback date', () => {
        let now: Moment;

        beforeEach(async () => {
          now = moment();
          sandbox.stub(Tabapay, 'disburse').resolves({
            status: ExternalTransactionStatus.Completed,
            id: 1,
            processor: ExternalTransactionProcessor.Tabapay,
          });
          sandbox.stub(SynapsepayNodeLib, 'disburse').resolves({
            status: ExternalTransactionStatus.Completed,
            id: 1,
            processor: ExternalTransactionProcessor.Synapsepay,
          });
          sandbox.stub(SynapsepayModels.nodes, 'getAsync').resolves({});
          sandbox.stub(SynapsepayModels.users, 'getAsync').resolves({});

          // Creates advance approval objects.
          const account = await BankAccount.findByPk(2);
          const bankConnection = await account.getBankConnection();
          const bankingDataSource = await generateBankingDataSource(bankConnection);
          sandbox.stub(bankingDataSource, 'getBalance').resolves({
            externalId: account.externalId,
            available: 3,
            current: 3,
          });
        });

        type tinyMoneyUserPaybackDateTestCase = {
          daysIntoTheFutureStartingFromToday: number;
          shouldFail: boolean;
        };

        const testTinyMoneyPaybackDateRange = (testCase: tinyMoneyUserPaybackDateTestCase) => {
          it(`should ${
            testCase.shouldFail ? '' : 'not'
          } pass for tiny money (micro advance) with user-specified payback as ${
            testCase.daysIntoTheFutureStartingFromToday
          } days in the future`, async () => {
            await AdminPaycheckOverride.destroy({ where: { userId: 3 } });

            const nextValidDay = now
              .clone()
              .add(testCase.daysIntoTheFutureStartingFromToday, 'day')
              .format('YYYY-MM-DD');

            const data = {
              bank_account_id: 2,
              amount: 15,
              delivery: 'standard',
              paybackDate: nextValidDay,
              donationOrganization: donationOrganization.code,
            };

            sandbox.stub(AdvanceApprovalClient, 'getAdvanceApproval').resolves(
              await factory.build('advance-approval', {
                bankAccountId: 2,
                userId: 3,
                defaultPaybackDate: moment().add(2, 'day'),
                approvedAmounts: [10, 5],
              }),
            );

            const result = await request(app)
              .post(advanceEndpoint)
              .set('Authorization', 'token-3')
              .set('X-Device-Id', 'id-3')
              .set('X-App-Version', minVersion)
              .send(data);

            if (testCase.shouldFail) {
              expect(result.body.type).to.equal('invalid_parameters');
              expect(result.body.message).to.contain(
                'Standard delivery is not supported within 4 days of payback date',
              );
              expect(result.body.customCode).to.equal(
                CUSTOM_ERROR_CODES.ADVANCE_PAYBACK_DATE_NOT_WITHIN_RANGE,
              );
            }
          });
        };

        const testCases: tinyMoneyUserPaybackDateTestCase[] = [
          { daysIntoTheFutureStartingFromToday: 2, shouldFail: true },
          { daysIntoTheFutureStartingFromToday: 3, shouldFail: true },
          { daysIntoTheFutureStartingFromToday: 4, shouldFail: false },
          { daysIntoTheFutureStartingFromToday: 5, shouldFail: false },
        ];

        testCases.forEach(testTinyMoneyPaybackDateRange);

        it('should ignore the payback date for a big money advance', async () => {
          const threeDaysFromNow = moment()
            .add(3, 'days')
            .format('YYYY-MM-DD');
          const fiveDaysFromNow = moment()
            .add(5, 'days')
            .format('YYYY-MM-DD');

          const data = {
            bank_account_id: 2,
            amount: 50,
            delivery: 'express',
            paybackDate: threeDaysFromNow,
            donationOrganization: donationOrganization.code,
          };

          sandbox.stub(AdvanceApprovalClient, 'getAdvanceApproval').resolves(
            await factory.build('advance-approval', {
              bankAccountId: 2,
              userId: 3,
              defaultPaybackDate: fiveDaysFromNow,
            }),
          );

          const result = await request(app)
            .post(advanceEndpoint)
            .set('Authorization', 'token-3')
            .set('X-Device-Id', 'id-3')
            .set('X-App-Version', minVersion)
            .send(data)
            .expect(200);

          expect(result.body.paybackDate).to.equal(fiveDaysFromNow);
        });

        it('should succeed with payback date for tiny money (micro advance) 4 days from today', async () => {
          await AdminPaycheckOverride.destroy({ where: { userId: 3 } });

          // The next valid business banking day needs to be a bit further in the future now
          const nextValidDay = nextBankingDay(now.clone().add(4, 'day'), 2).format('YYYY-MM-DD');

          const data = {
            bank_account_id: 2,
            amount: 15,
            delivery: 'express',
            paybackDate: nextValidDay,
            donationOrganization: donationOrganization.code,
          };

          sandbox.stub(AdvanceApprovalClient, 'getAdvanceApproval').resolves(
            await factory.build('advance-approval', {
              bankAccountId: 2,
              userId: 3,
              defaultPaybackDate: null,
              approvedAmounts: [10, 5],
            }),
          );

          const result = await request(app)
            .post(advanceEndpoint)
            .set('Authorization', 'token-3')
            .set('X-Device-Id', 'id-3')
            .set('X-App-Version', minVersion)
            .send(data);

          expect(result.body.paybackDate).to.equal(nextValidDay);
        });

        it('should fail with an out-of-range payback date for micro advance', async () => {
          await AdminPaycheckOverride.destroy({ where: { userId: 3 } });

          const tooManyDaysAway = now.add(15, 'days').format('YYYY-MM-DD');

          const data = {
            bank_account_id: 2,
            amount: 15,
            delivery: 'express',
            paybackDate: tooManyDaysAway,
            donationOrganization: donationOrganization.code,
          };

          sandbox.stub(AdvanceApprovalClient, 'getAdvanceApproval').resolves(
            await factory.build('advance-approval', {
              bankAccountId: 2,
              userId: 3,
              defaultPaybackDate: moment().add(20, 'day'),
              approvedAmounts: [10, 5],
            }),
          );

          const result = await request(app)
            .post(advanceEndpoint)
            .set('Authorization', 'token-3')
            .set('X-Device-Id', 'id-3')
            .set('X-App-Version', minVersion)
            .send(data)
            .expect(400);

          expect(result.body.message).to.match(/Payback date \w+ \d{1,2} is no longer valid/);
        });

        it('should fail with payback date less than 4 days away for micro advance', async () => {
          await AdminPaycheckOverride.destroy({ where: { userId: 3 } });

          // The next valid business banking day needs to be a bit further in the future now
          const nextValidDay = nextBankingDay(now.clone().add(4, 'day'), 2).format('YYYY-MM-DD');

          const data = {
            bank_account_id: 2,
            amount: 15,
            delivery: 'express',
            paybackDate: nextValidDay,
            donationOrganization: donationOrganization.code,
          };

          sandbox.stub(AdvanceApprovalClient, 'getAdvanceApproval').resolves(
            await factory.build('advance-approval', {
              bankAccountId: 2,
              userId: 3,
              defaultPaybackDate: moment().add(2, 'day'),
              approvedAmounts: [10, 5],
            }),
          );

          const result = await request(app)
            .post(advanceEndpoint)
            .set('Authorization', 'token-3')
            .set('X-Device-Id', 'id-3')
            .set('X-App-Version', minVersion)
            .send(data)
            .expect(200);

          expect(result.body.paybackDate).to.equal(nextValidDay);
        });
      });

      it('should disburse the advance via standard delivery', async () => {
        const synapseStub = sandbox.stub().resolves({
          status: ExternalTransactionStatus.Completed,
          externalId: 1,
          processor: ExternalTransactionProcessor.Synapsepay,
        });
        sandbox
          .stub(Loomis, 'getPaymentGateway')
          .withArgs(PaymentGateway.Synapsepay)
          .returns({ createTransaction: synapseStub });
        sandbox.stub(SynapsepayModels.nodes, 'getAsync').resolves({});
        sandbox.stub(SynapsepayModels.users, 'getAsync').resolves({});

        const data = {
          bank_account_id: 2,
          amount: 50,
          delivery: 'standard',
          donationOrganization: donationOrganization.code,
        };

        sandbox.stub(AdvanceApprovalClient, 'getAdvanceApproval').resolves(
          await factory.build('advance-approval', {
            bankAccountId: 2,
            userId: 3,
            defaultPaybackDate: moment().add(5, 'day'),
          }),
        );

        return request(app)
          .post(advanceEndpoint)
          .set('Authorization', 'token-3')
          .set('X-Device-Id', 'id-3')
          .set('X-App-Version', minVersion)
          .send(data)
          .expect(200)
          .then(res => {
            expect(synapseStub).to.have.callCount(1);
            expect(res.body.amount).to.equal(50);
            expect(res.body.fee).to.equal(0);
            expect(res.body.tip).to.eq(2.5);
            expect(res.body.tipPercent).to.equal(5);
            expect(res.body.outstanding).to.equal(52.5);
            expect(res.body.donationOrganization).to.eq(DonationOrganizationCode.TREES);
            expect(res.body.destination.lastFour).to.equal('1111');
            expect(res.body.destination.displayName).to.equal('Account 2');
            expect(res.body.destination.scheme).to.be.undefined;
          });
      });

      it('should fail if a payment method is not available for the bank account', async () => {
        const data = {
          bank_account_id: 2,
          amount: 50,
          delivery: 'standard',
        };

        // Creates advance approval objects.
        const account = await BankAccount.findByPk(2);
        const paymentMethod = await account.getDefaultPaymentMethod();
        await paymentMethod.destroy();

        sandbox.stub(AdvanceApprovalClient, 'getAdvanceApproval').resolves(
          await factory.build('advance-approval', {
            bankAccountId: 2,
            userId: 3,
            defaultPaybackDate: moment().add(2, 'day'),
          }),
        );

        return request(app)
          .post(advanceEndpoint)
          .set('Authorization', 'token-3')
          .set('X-Device-Id', 'id-3')
          .set('X-App-Version', minVersion)
          .send(data)
          .expect(400)
          .then(res => {
            expect(res.body.message).to.match(/Missing paymentMethodId/);
          });
      });

      it('can disburse to a DaveBanking Account without a payment method', async () => {
        const account = await BankAccount.findByPk(2);
        const paymentMethod = await account.getDefaultPaymentMethod();
        await paymentMethod.destroy();
        const bankConnection = await account.getBankConnection();
        await bankConnection.update({ bankingDataSource: BankingDataSource.BankOfDave });

        const bankOfDaveStub = sandbox.stub().resolves({
          externalId: 'yay',
          status: ExternalTransactionStatus.Completed,
          processor: ExternalTransactionProcessor.BankOfDave,
        });
        sandbox
          .stub(Loomis, 'getPaymentGateway')
          .withArgs(PaymentGateway.BankOfDave)
          .returns({ createTransaction: bankOfDaveStub });

        const data = {
          bank_account_id: 2,
          amount: 100,
          delivery: 'standard', //Pass in standard for Bank Of Dave for fees
          donationOrganization: donationOrganization.code,
        };

        sandbox.stub(AdvanceApprovalClient, 'getAdvanceApproval').resolves(
          await factory.build('advance-approval', {
            bankAccountId: 2,
            userId: 3,
            defaultPaybackDate: moment().add(5, 'day'),
            approvedAmounts: [100, 75, 50],
          }),
        );

        const res = await request(app)
          .post(advanceEndpoint)
          .set('Authorization', 'token-3')
          .set('X-Device-Id', 'id-3')
          .set('X-App-Version', minVersion)
          .send(data);

        expect(
          bankOfDaveStub.calledWith({
            type: PaymentProviderTransactionType.AdvanceDisbursement,
            ownerId: bankConnection.externalId,
            sourceId: account.externalId,
            referenceId: sinon.match.any,
            amount: data.amount,
            delivery: PaymentProviderDelivery.STANDARD,
          }),
        ).to.eq(true);
        expect(res.body.amount).to.equal(100);
        expect(res.body.fee).to.equal(0);
        expect(res.body.tip).to.eq(5);
        expect(res.body.tipPercent).to.equal(5);
        expect(res.body.outstanding).to.equal(105);
        expect(res.body.donationOrganization).to.eq(DonationOrganizationCode.TREES);
        expect(res.body.destination.lastFour).to.equal('1111');

        const advance = await Advance.findByPk(res.body.id);
        expect(advance.paymentMethodId).to.equal(null);
      });

      it('should not advance to a user with a closed synapse doc when bank account is not Dave banking', async () => {
        const account = await BankAccount.findByPk(2);
        await SynapsepayDocument.update(
          {
            permission: 'CLOSED',
          },
          { where: { userId: account.userId } },
        );

        const data = {
          bank_account_id: 2,
          amount: 75,
          delivery: 'express',
        };

        sandbox.stub(AdvanceApprovalClient, 'getAdvanceApproval').resolves(
          await factory.build('advance-approval', {
            bankAccountId: 2,
            userId: 3,
            defaultPaybackDate: moment().add(2, 'day'),
          }),
        );

        const res = await request(app)
          .post(advanceEndpoint)
          .set('Authorization', 'token-3')
          .set('X-Device-Id', 'id-3')
          .set('X-App-Version', minVersion)
          .send(data)
          .expect(400);

        expect(res.body.message).to.include(IdentityVerificationError.CLOSED_PERMISSION);
      });

      it('should return network as null when neither approvalCode nor networkId is defined', async () => {
        const network: AdvanceNetwork = {
          approvalCode: undefined,
          networkId: undefined,
          settlementNetwork: 'visa',
        };
        sandbox.stub(Tabapay, 'disburse').resolves({
          status: ExternalTransactionStatus.Completed,
          id: 1,
          processor: ExternalTransactionProcessor.Tabapay,
          network,
        });
        sandbox.stub(SynapsepayModels.nodes, 'getAsync').resolves({});
        sandbox.stub(SynapsepayModels.users, 'getAsync').resolves({});

        const data = {
          bank_account_id: 2,
          amount: 50,
          donationOrganization: donationOrganization.code,
        };

        sandbox.stub(AdvanceApprovalClient, 'getAdvanceApproval').resolves(
          await factory.build('advance-approval', {
            bankAccountId: 2,
            userId: 3,
            defaultPaybackDate: moment().add(2, 'day'),
          }),
        );

        return request(app)
          .post(advanceEndpoint)
          .set('Authorization', 'token-3')
          .set('X-Device-Id', 'id-3')
          .set('X-App-Version', minVersion)
          .send(data)
          .expect(200)
          .then(res => {
            expect(res.body.network).to.be.null;
          });
      });
    });

    describe('PATCH /advance/:id', () => {
      let broadcastAdvanceTipChangedJobStub: sinon.SinonStub;

      beforeEach(() => {
        broadcastAdvanceTipChangedJobStub = sandbox.stub(Jobs, 'broadcastAdvanceTipChangedTask');
      });

      it('should fail if the tip_amount is invalid', async () => {
        const ad = await factory.create('advance', { userId: 3, outstanding: 10 });
        return request(app)
          .patch(`/v2/advance/${ad.id}`)
          .set('Authorization', 'token-3')
          .set('X-Device-Id', 'id-3')
          .send({ tip_percent: 'foobar' })
          .expect(400)
          .then(res => {
            expect(res.body.message).to.match(/must be between 0 and 50/);
          });
      });

      it('should fail if the advance outstanding is 0', async () => {
        const ad = await factory.create('advance', { userId: 3, outstanding: 0 });
        const res = await request(app)
          .patch(`/v2/advance/${ad.id}`)
          .set('Authorization', 'token-3')
          .set('X-Device-Id', 'id-3')
          .send({ tip_percent: 100 })
          .expect(400);
        expect(res.body.message).to.match(/Advance is already paid back and cannot be updated/);
      });

      it('should fail to update tip if a payment is pending', async () => {
        const advance = await factory.create<Advance>('advance');
        const initialTipPercent = 10;
        const initialTipAmount = (advance.amount * initialTipPercent) / 100;
        const [, advanceTip] = await Promise.all([
          factory.create('payment', {
            advanceId: advance.id,
            status: ExternalTransactionStatus.Pending,
          }),
          factory.create<AdvanceTip>('advance-tip', {
            advanceId: advance.id,
            amount: initialTipAmount,
            percent: initialTipPercent,
          }),
        ]);
        const res = await request(app)
          .patch(`/v2/advance/${advance.id}`)
          .set('Authorization', `${advance.userId}`)
          .set('X-Device-Id', `${advance.userId}`)
          .send({ tip_percent: 0 })
          .expect(409);
        await advanceTip.reload();
        expect(res.body.message).to.match(/Cannot update tip while collection is in progress/);
        expect(advanceTip.percent).to.equal(initialTipPercent);
        expect(advanceTip.amount).to.equal(initialTipAmount);
      });

      it('should set the tip for an advance and update its outstanding amount', async () => {
        const adv = await factory.create('advance', { userId: 3, outstanding: 10, amount: 50 });
        const advanceTip = await factory.create('advance-tip', {
          advanceId: adv.id,
          amount: 0,
          donationOrganizationId: donationOrganization.id,
        });
        const appsflyerDeviceId = 'some-appsflyer-id';
        const platform = Platforms.Android;
        const ip = 'some.ip';

        return request(app)
          .patch(`/v2/advance/${adv.id}`)
          .set('Authorization', 'token-3')
          .set('X-Device-Id', 'id-3')
          .set('X-AppsFlyer-ID', appsflyerDeviceId)
          .set('X-Device-Type', platform)
          .set('X-Forwarded-For', ip)
          .send({
            tip_percent: 10,
            source: 'user',
          })
          .expect(200)
          .then(res => {
            expect(res.body.success).to.equal(true);
            return Advance.findByPk(adv.id);
          })
          .then(async advance => {
            await advanceTip.reload();
            expect(advance.amount).to.equal(50);
            expect(advance.outstanding).to.equal(15);
            expect(advanceTip.amount).to.equal(5);
            expect(advanceTip.percent).to.equal(10);
            expect(advanceTip.donationOrganizationId).to.equal(donationOrganization.id);
            expect(broadcastAdvanceTipChangedJobStub).to.be.calledWithExactly({
              advanceId: advance.id,
              amount: 5,
              appsflyerDeviceId,
              ip,
              platform,
              userId: 3,
            });
          });
      });

      it('should add one entry in the modifications array if the tip is being updated for the first time', async () => {
        const [advance] = await Promise.all([
          factory.create('advance', { userId: 3, outstanding: 50 }),
        ]);
        await factory.create('advance-tip', {
          advanceId: advance.id,
          amount: 0,
          tip: 0,
        });
        const response = await request(app)
          .patch(`/v2/advance/${advance.id}`)
          .set('Authorization', 'token-3')
          .set('X-Device-Id', 'id-3')
          .send({ tip_percent: 40, source: 'user' });

        await advance.reload();
        expect(response.status).to.equal(200);
        expect(advance.modifications.length).to.equal(1);
        expect(broadcastAdvanceTipChangedJobStub).to.be.calledOnce;
      });

      it('setting tip amount to less than the outstanding should cause an error', async () => {
        const [advance] = await Promise.all([
          factory.create('advance', { userId: 3, outstanding: 10, tip: 15 }),
        ]);
        await factory.create('advance-tip', {
          advanceId: advance.id,
          amount: 15,
          percent: 20,
        });
        const response = await request(app)
          .patch(`/v2/advance/${advance.id}`)
          .set('Authorization', 'token-3')
          .set('X-Device-Id', 'id-3')
          .send({ tip_percent: 0, source: 'user' });

        expect(response.status).to.equal(400);
        expect(broadcastAdvanceTipChangedJobStub).not.to.be.called;
      });

      it('should add two entries in the modifications array', async () => {
        // This test is necessary since there was a bug that was overwriting the last modification each time, resulting in only one modification each time
        const advance = await factory.create('advance', {
          userId: 3,
          outstanding: 50,
        });
        await factory.create('advance-tip', {
          advanceId: advance.id,
          amount: 0,
          tip: 0,
          donationOrganizationId: donationOrganization.id,
        });
        await request(app)
          .patch(`/v2/advance/${advance.id}`)
          .set('Authorization', 'token-3')
          .set('X-Device-Id', 'id-3')
          .send({ tip_percent: 15, source: 'user' });

        await request(app)
          .patch(`/v2/advance/${advance.id}`)
          .set('Authorization', 'token-3')
          .set('X-Device-Id', 'id-3')
          .send({ tip_percent: 30, source: 'user' });

        await advance.reload();
        expect(advance.modifications.length).to.equal(2);
        expect(broadcastAdvanceTipChangedJobStub).to.be.calledTwice;
      });

      context('screenshots ', () => {
        const directory = 'advance-screenshots';
        const stubbedUuid = '6f3019a2-90e8-4454-822c-8f09e8f38dcb';
        const screenshotContents = {} as Express.Multer.File;

        function generateURL(userId: number) {
          return mockGCloudStorageUrl(directory, userId, stubbedUuid);
        }

        it('should set the screenshot if screenshot_contents is provided', async () => {
          const advance = await factory.create<Advance>('advance');
          const url = generateURL(advance.userId);
          sandbox.stub(uuid, 'v4').returns(stubbedUuid);
          const gCloudStub = sandbox.stub(gcloudStorage, 'saveImageToGCloud').resolves(url);

          expect(advance.screenshotImage).to.be.undefined;
          await request(app)
            .patch(`/v2/advance/${advance.id}`)
            .set('Authorization', `${advance.userId}`)
            .set('X-Device-Id', `${advance.userId}`)
            .send({ screenshot_contents: screenshotContents })
            .expect(200);
          const updatedAdvance = await Advance.findOne({ where: { id: advance.id } });
          expect(updatedAdvance.screenshotImage).to.equal(url);
          expect(gCloudStub).to.be.calledWithExactly(
            screenshotContents,
            directory,
            `${advance.userId}-${stubbedUuid}`,
          );
        });

        it('should return 502 error if screenshot upload fails', async () => {
          const advance = await factory.create<Advance>('advance');
          sandbox.stub(gcloudStorage, 'saveImageToGCloud').resolves(null);

          await request(app)
            .patch(`/v2/advance/${advance.id}`)
            .set('Authorization', `${advance.userId}`)
            .set('X-Device-Id', `${advance.userId}`)
            .send({ screenshot_contents: screenshotContents })
            .expect(502);
        });

        it('should not allow multiple screenshots per advance', async () => {
          const advance = await factory.create<Advance>('advance');
          const url = generateURL(advance.userId);
          sandbox.stub(uuid, 'v4').returns(stubbedUuid);
          sandbox.stub(gcloudStorage, 'saveImageToGCloud').resolves(url);

          await request(app)
            .patch(`/v2/advance/${advance.id}`)
            .set('Authorization', `${advance.userId}`)
            .set('X-Device-Id', `${advance.userId}`)
            .send({ screenshot_contents: screenshotContents })
            .expect(200);
          const response = await request(app)
            .patch(`/v2/advance/${advance.id}`)
            .set('Authorization', `${advance.userId}`)
            .set('X-Device-Id', `${advance.userId}`)
            .send({ screenshot_contents: screenshotContents })
            .expect(400);
          expect(response.body.type).to.equal('invalid_parameters');
        });
      });
    });
  });

  describe('GET /advance', () => {
    it('should get the advances for a user, filtering canceled ones', async () => {
      const plaidBankAccount = await factory.create<BankAccount>('checking-account');
      const daveBankAccount = await factory.create<BankAccount>('bod-checking-account', {
        userId: plaidBankAccount.userId,
      });
      const [advance1, advance2, advance3, donationOrganization] = await Promise.all([
        factory.create<Advance>('advance', {
          bankAccountId: plaidBankAccount.id,
          createdDate: moment().subtract(1, 'month'),
          delivery: AdvanceDelivery.Standard,
          disbursementProcessor: ExternalTransactionProcessor.Synapsepay,
          disbursementStatus: ExternalTransactionStatus.Completed,
          outstanding: 0,
          userId: plaidBankAccount.userId,
        }),
        factory.create<Advance>('advance', {
          bankAccountId: daveBankAccount.id,
          createdDate: moment().subtract(12, 'days'),
          delivery: AdvanceDelivery.Express,
          disbursementProcessor: ExternalTransactionProcessor.BankOfDave,
          disbursementStatus: ExternalTransactionStatus.Canceled,
          outstanding: 0,
          userId: plaidBankAccount.userId,
        }),
        factory.create<Advance>('advance', {
          createdDate: moment().subtract(11, 'days'),
          delivery: AdvanceDelivery.Express,
          bankAccountId: daveBankAccount.id,
          disbursementProcessor: ExternalTransactionProcessor.BankOfDave,
          disbursementStatus: ExternalTransactionStatus.Completed,
          userId: plaidBankAccount.userId,
        }),
        factory.create('donation-organization'),
      ]);
      await Promise.all([
        factory.create<AdvanceTip>('advance-tip', { advanceId: advance1.id, donationOrganization }),
        factory.create<AdvanceTip>('advance-tip', { advanceId: advance2.id, donationOrganization }),
        factory.create<AdvanceTip>('advance-tip', { advanceId: advance3.id, donationOrganization }),
      ]);

      const result = await request(app)
        .get(advanceEndpoint)
        .set('Authorization', `${plaidBankAccount.userId}`)
        .set('X-Device-Id', `${plaidBankAccount.userId}`);

      expect(result.status).to.equal(200);
      expect(result.body).to.be.jsonSchema(advanceSchema);
      expect(result.body.length).to.equal(2);
      expect(result.body[0].network).to.be.null;
      expect(result.body[0].destination.lastFour).to.exist;
      expect(result.body[0].destination.displayName).to.exist;
      expect(result.body[1].network).to.be.null;
      expect(result.body[1].destination.lastFour).to.exist;
      expect(result.body[1].destination.displayName).to.exist;
    });

    it('should get the advances for a user, filtering returned ones', async () => {
      const bankAccount = await factory.create('checking-account');
      const paymentMethod = await factory.create('payment-method', {
        bankAccountId: bankAccount.id,
      });
      const [advance1, advance2, donationOrganization] = await Promise.all([
        factory.create('advance', {
          userId: bankAccount.userId,
          bankAccountId: bankAccount.id,
          createdDate: moment(),
          disbursementProcessor: ExternalTransactionProcessor.Tabapay,
          paymentMethodId: paymentMethod.id,
        }),
        factory.create('advance', {
          userId: bankAccount.userId,
          bankAccountId: bankAccount.id,
          disbursementStatus: 'Returned',
          createdDate: moment().subtract(2, 'days'),
          paymentMethodId: paymentMethod.id,
        }),
        factory.create('donation-organization'),
      ]);
      await factory.create('advance-tip', {
        advanceId: advance1.id,
        donationOrganizationId: donationOrganization.id,
      });
      await factory.create('advance-tip', {
        advanceId: advance2.id,
        donationOrganizationId: donationOrganization.id,
      });

      const result = await request(app)
        .get(advanceEndpoint)
        .set('Authorization', `${bankAccount.userId}`)
        .set('X-Device-Id', `${bankAccount.userId}`);
      expect(result.status).to.equal(200);
      expect(result.body.length).to.equal(1);
      expect(result.body[0].id).to.equal(advance1.id);
      expect(result.body[0].destination.lastFour).to.exist;
      expect(result.body[0].destination.displayName).to.exist;
      expect(result.body[0].destination.scheme).to.exist;
      expect(result.body[0].network).to.be.null;
    });

    it('should return the payment method for any payments made', async () => {
      const bankAccount = await factory.create('checking-account');
      const [advance, donationOrganization] = await Promise.all([
        factory.create('advance', {
          userId: bankAccount.userId,
          bankAccountId: bankAccount.id,
          createdDate: moment(),
        }),
        factory.create('donation-organization'),
      ]);
      await factory.create('advance-tip', {
        advanceId: advance.id,
        donationOrganizationId: donationOrganization.id,
      });

      const paymentMethod = await factory.create('payment-method');
      const payment = await factory.create('payment', {
        advanceId: advance.id,
        paymentMethodId: paymentMethod.id,
      });

      const result = await request(app)
        .get(advanceEndpoint)
        .set('Authorization', `${bankAccount.userId}`)
        .set('X-Device-Id', `${bankAccount.userId}`);

      expect(result.status).to.equal(200);
      expect(result.body[0].payments[0].id).to.equal(payment.id);
      expect(result.body[0].payments[0]).to.haveOwnProperty('paymentMethod');
      expect(result.body[0].payments[0].paymentMethod).to.haveOwnProperty('scheme');
      expect(result.body[0].payments[0].paymentMethod).to.haveOwnProperty('mask');
    });

    [
      {
        advanceExperimentLog: null,
        expected: false,
      },
      {
        advanceExperimentLog: { success: false },
        expected: false,
      },
      {
        advanceExperimentLog: { success: true },
        expected: true,
      },
    ].forEach(({ advanceExperimentLog, expected }) => {
      it('should return the a flag letting us know if the advance was given in an experiment', async () => {
        const user = await factory.create<User>('user');
        const [advance, donationOrganization] = await Promise.all([
          factory.create<Advance>('advance', {
            userId: user.id,
            disbursementStatus: ExternalTransactionStatus.Completed,
            externalId: 'external id',
          }),
          factory.create('donation-organization'),
        ]);
        await Promise.all([
          factory.create('advance-tip', {
            advanceId: advance.id,
            donationOrganizationId: donationOrganization.id,
          }),
          advanceExperimentLog
            ? factory.create('advance-experiment-log', {
                advanceId: advance.id,
                ...advanceExperimentLog,
              })
            : null,
        ]);

        const result = await request(app)
          .get(advanceEndpoint)
          .set('Authorization', `${user.id}`)
          .set('X-Device-Id', `${user.id}`);

        expect(result.status).to.equal(200);
        expect(result.body.length).to.equal(1);
        expect(result.body[0].isExperimental).to.eq(expected);
      });
    });
  });

  describe('POST /upload', () => {
    const directory = 'advance-screenshots';
    const screenshotContents = {} as Express.Multer.File;
    const stubbedUuid = '8a4719a2-97e8-4454-822c-8f79e8f38dcb';

    beforeEach(() => {
      sandbox.stub(uuid, 'v4').returns(stubbedUuid);
    });
    afterEach(() => clean(sandbox));

    function generateURL(userId: number) {
      return mockGCloudStorageUrl(directory, userId, stubbedUuid);
    }

    it('should return an exception when no image content is provided', async () => {
      const user = await factory.create<User>('user');
      const url = generateURL(user.id);
      sandbox.stub(gcloudStorage, 'saveImageToGCloud').resolves(url);
      const response = await request(app)
        .post(`${advanceEndpoint}/upload_screenshot`)
        .set('Authorization', `${user.id}`)
        .set('X-Device-Id', `${user.id}`)
        .send({ screenshot_wrong_param: screenshotContents })
        .expect(400);
      expect(response.body.type).to.equal('invalid_parameters');
    });

    it('should return an screenshotResponse when the screenshot contents are provided', async () => {
      const user = await factory.create<User>('user');
      const url = generateURL(user.id);
      const gCloudStub = sandbox.stub(gcloudStorage, 'saveImageToGCloud').resolves(url);
      const response = await request(app)
        .post(`${advanceEndpoint}/upload_screenshot`)
        .set('Authorization', `${user.id}`)
        .set('X-Device-Id', `${user.id}`)
        .send({ screenshot_contents: screenshotContents })
        .expect(200);
      expect(response.body.screenshotUrl).to.equal(url);
      expect(gCloudStub).to.be.calledWithExactly(
        screenshotContents,
        directory,
        `${user.id}-${stubbedUuid}`,
      );
    });

    it('should return an Google storage exception to the client when the screenshot contents couldnt be uploaded', async () => {
      const user = await factory.create<User>('user');
      const gCloudStub = sandbox.stub(gcloudStorage, 'saveImageToGCloud').returns(null);
      await request(app)
        .post(`${advanceEndpoint}/upload_screenshot`)
        .set('Authorization', `${user.id}`)
        .set('X-Device-Id', `${user.id}`)
        .send({ screenshot_contents: screenshotContents })
        .expect(502);
      expect(gCloudStub).to.be.calledWithExactly(
        screenshotContents,
        directory,
        `${user.id}-${stubbedUuid}`,
      );
    });
  });

  describe('GET /rules', () => {
    it('should return rules from getRules', async () => {
      const expected = { bacon: true };
      sandbox.stub(AdvanceApprovalClient, 'getRules').resolves(expected);
      const user = await factory.create('user');
      const result = await request(app)
        .get(`${advanceEndpoint}/rules`)
        .set('Authorization', user.id)
        .set('X-Device-Id', user.id);

      expect(result.status).to.equal(200);
      expect(result.body).to.deep.eq(expected);
    });

    it('should force a re-install for bank of dave users', async () => {
      const user = await factory.create('user');
      const bankAccount = await factory.create('bod-checking-account', {
        userId: user.id,
      });
      await user.update({ defaultBankAccountId: bankAccount.id });
      const result = await request(app)
        .get(`${advanceEndpoint}/rules`)
        .set('Authorization', user.id)
        .set('X-Device-Id', user.id);

      expect(result.status).to.equal(400);
      expect(result.body.customCode).to.equal(CUSTOM_ERROR_CODES.FORCE_APP_RE_INSTALL);
    });

    it('should not force a re-install for bank of dave users if on new app version', async () => {
      sandbox.stub(AdvanceApprovalClient, 'getRules').resolves({});
      const user = await factory.create('user');
      const bankAccount = await factory.create('bod-checking-account', {
        userId: user.id,
      });
      await user.update({ defaultBankAccountId: bankAccount.id });
      const result = await request(app)
        .get(`${advanceEndpoint}/rules`)
        .set('Authorization', user.id)
        .set('X-Device-Id', user.id)
        .set('X-App-Version', '2.25.1');

      expect(result.status).to.equal(200);
    });

    it('should return 400 error if no auth provided', async () => {
      await request(app)
        .get(`${advanceEndpoint}/rules`)
        .expect(400);
    });

    it('should return 401 error if invalid auth provided', async () => {
      await request(app)
        .get(`${advanceEndpoint}/rules`)
        .set('Authorization', 'bad auth token')
        .set('X-Device-Id', 'id-3')
        .expect(401);
    });
  });
});
