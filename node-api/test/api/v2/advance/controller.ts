import { moment } from '@dave-inc/time-lib';
import {
  DonationOrganizationCode,
  ExternalTransactionProcessor,
  ExternalTransactionStatus,
  MicroDeposit,
  PaymentProviderDelivery,
} from '@dave-inc/wire-typings';
import { expect, use } from 'chai';
import chaiAsPromised from 'chai-as-promised';
import * as sinon from 'sinon';
import { PaymentMethod as PaymentMethodLoomis } from '@dave-inc/loomis-client';
import {
  disburseAdvance,
  getAdvanceApproval,
  getAdvanceById,
  getAdvancePaymentMap,
  getAdvancesByUser,
  getDonationOrganizationId,
  updateAdvance,
  validatePaybackDate,
  verifyAdvanceAmount,
} from '../../../../src/api/v2/advance/controller';
import * as SynapsepayModels from '../../../../src/domain/synapsepay/external-model-definitions';
import * as Jobs from '../../../../src/jobs/data';
import { dogstatsd } from '../../../../src/lib/datadog-statsd';
import { ConflictError, InvalidParametersError } from '../../../../src/lib/error';
import gcloudStorage from '../../../../src/lib/gcloud-storage';
import * as Tabapay from '../../../../src/lib/tabapay';
import { Advance, AdvanceTip, AuditLog, BankAccount, User } from '../../../../src/models';
import { FailureMessageKey } from '../../../../src/translations';
import {
  AppsflyerProperties,
  ExternalDisbursement,
  paymentMethodModelToType,
  Platforms,
} from '../../../../src/typings';
import factory from '../../../factories';
import {
  clean,
  fakeDateTime,
  stubBalanceLogClient,
  stubBankTransactionClient,
  stubLoomisClient,
} from '../../../test-helpers';
import AdvanceApprovalClient from '../../../../src/lib/advance-approval-client';
import { MAX_ADVANCE_AMOUNT } from '../../../../src/services/advance-approval/advance-approval-engine/common';
import { AdvanceApprovalGetResponse } from '../../../../src/services/advance-approval/types';

describe('Advance Controller', () => {
  const sandbox = sinon.createSandbox();
  const ip = '127.0.0.1';
  const appsflyerDeviceId = 'some-id';
  const platform = Platforms.Android;

  function getAnalyticsData(userId: number): AppsflyerProperties {
    return {
      userId,
      ip,
      appsflyerDeviceId,
      platform,
    };
  }

  before(() => clean());

  beforeEach(() => {
    stubLoomisClient(sandbox);
    stubBankTransactionClient(sandbox);
    stubBalanceLogClient(sandbox);
  });

  afterEach(() => clean(sandbox));

  describe('getDonationOrganizationId', () => {
    it('should return id for FEEDING_AMERICA if it was passed that code', async () => {
      const donationOrganization = await factory.create('donation-organization', {
        code: DonationOrganizationCode.FEEDING_AMERICA,
      });
      const donationInfo = {
        donationOrganization: DonationOrganizationCode.FEEDING_AMERICA,
        isTreesOnlyAppVersion: false,
        isUpdatedAppVersion: true,
      };
      const organizationId = await getDonationOrganizationId(donationInfo, 50);
      expect(organizationId).to.be.eq(donationOrganization.id);
    });

    it('should return id for TREES for big money if no organization and app version does not support organization options', async () => {
      const donationOrganization = await factory.create('donation-organization', {
        code: DonationOrganizationCode.TREES,
      });
      const donationInfo = {
        donationOrganization: null as string,
        isTreesOnlyAppVersion: true,
        isUpdatedAppVersion: false,
      };
      const organizationId = await getDonationOrganizationId(donationInfo, 50);
      expect(organizationId).to.be.eq(donationOrganization.id);
    });

    it('should return id for UNKNOWN for big money if no organization and app version is before 2.12.5', async () => {
      const donationOrganization = await factory.create('donation-organization', {
        code: DonationOrganizationCode.UNKNOWN,
      });
      const donationInfo = {
        donationOrganization: null as string,
        isTreesOnlyAppVersion: false,
        isUpdatedAppVersion: false,
      };
      const organizationId = await getDonationOrganizationId(donationInfo, 50);
      expect(organizationId).to.be.eq(donationOrganization.id);
    });

    it('should return undefined for tiny money and app version is before 2.12.5', async () => {
      const donationInfo = {
        donationOrganization: null as string,
        isTreesOnlyAppVersion: false,
        isUpdatedAppVersion: false,
      };
      const organizationId = await getDonationOrganizationId(donationInfo, 20);
      expect(organizationId).to.be.undefined;
    });
  });

  describe('disburseAdvance', () => {
    let user: User;
    let bankAccount: BankAccount;
    let paymentMethod: PaymentMethodLoomis;
    let broadcastAdvanceDisbursementJobStub: sinon.SinonStub;

    beforeEach(async () => {
      user = await factory.create('user');
      const bankConnection = await factory.create('bank-connection', { userId: user.id });
      bankAccount = await factory.create('bank-account', {
        userId: user.id,
        bankConnectionId: bankConnection.id,
      });
      const paymentMethodModel = await factory.create('payment-method', {
        bankAccountId: bankAccount.id,
        userId: user.id,
      });
      paymentMethod = paymentMethodModelToType(paymentMethodModel);
      broadcastAdvanceDisbursementJobStub = sandbox.stub(Jobs, 'broadcastAdvanceDisbursementTask');
    });

    it('should throw an error if updating the advance fails', async () => {
      use(() => chaiAsPromised);
      const datadogSpy = sandbox.spy(dogstatsd, 'increment');
      sandbox.stub(Tabapay, 'disburse').resolves({
        status: ExternalTransactionStatus.Canceled,
        id: 1,
        processor: ExternalTransactionProcessor.Tabapay,
      });
      sandbox.stub(SynapsepayModels.nodes, 'getAsync').resolves({});
      sandbox.stub(SynapsepayModels.users, 'getAsync').resolves({});

      const advance = await factory.create('advance', {
        userId: user.id,
        bankAccountId: bankAccount.id,
        delivery: PaymentProviderDelivery.EXPRESS,
      });

      sandbox.stub(advance, 'update').throws(new Error('Some Fake Error'));

      await expect(disburseAdvance(advance, bankAccount, user, paymentMethod)).to.be.rejectedWith(
        FailureMessageKey.TransactionProcessingFailure,
      );

      sinon.assert.calledWithExactly(datadogSpy, 'advance_disbursement.failed_advance_update');
    });

    it('should ignore advance update errors if the advance disbursementStatus is pending', async () => {
      const tabapayDisbursementResponse = {
        status: ExternalTransactionStatus.Completed,
        id: 1,
        processor: ExternalTransactionProcessor.Tabapay,
      };
      sandbox.stub(Tabapay, 'disburse').resolves(tabapayDisbursementResponse);
      sandbox.stub(SynapsepayModels.nodes, 'getAsync').resolves({});
      sandbox.stub(SynapsepayModels.users, 'getAsync').resolves({});

      const advance = await factory.create('advance', {
        userId: user.id,
        bankAccountId: bankAccount.id,
        delivery: PaymentProviderDelivery.EXPRESS,
        disbursementStatus: ExternalTransactionStatus.Pending,
      });

      await disburseAdvance(advance, bankAccount, user, paymentMethod, getAnalyticsData(user.id));

      const [auditLog] = await Promise.all([
        AuditLog.findOne({ where: { userId: user.id } }),
        advance.reload(),
      ]);

      expect(auditLog.eventUuid).to.be.eq(`${advance.id}`);
      expect(auditLog.type).to.be.eq('ADVANCE_REQUEST');
      expect(auditLog.extra).to.be.deep.eq(tabapayDisbursementResponse);

      expect(advance.externalId).to.be.eq(`${tabapayDisbursementResponse.id}`);
      expect(advance.disbursementProcessor).to.be.eq(tabapayDisbursementResponse.processor);
      expect(advance.disbursementStatus).to.be.eq(tabapayDisbursementResponse.status);

      expect(broadcastAdvanceDisbursementJobStub).to.be.calledWithExactly({
        advanceId: advance.id,
        userId: user.id,
        ip,
        platform,
        appsflyerDeviceId,
      });
    });

    context('advance network data', () => {
      let advance: Advance;

      beforeEach(async () => {
        advance = await factory.create('advance', {
          userId: user.id,
          bankAccountId: bankAccount.id,
          delivery: PaymentProviderDelivery.EXPRESS,
          disbursementStatus: ExternalTransactionStatus.Completed,
        });
      });

      it('should update Tabapay advances with approvalCode, network, and networkId', async () => {
        const settlementNetwork = 'Visa';
        const networkId = '574858745';
        const approvalCode = '4578794';
        const tabapayDisbursementResponse: ExternalDisbursement = {
          id: '1',
          network: {
            approvalCode,
            networkId,
            settlementNetwork,
          },
          status: ExternalTransactionStatus.Completed,
          processor: ExternalTransactionProcessor.Tabapay,
        };
        sandbox.stub(Tabapay, 'disburse').resolves(tabapayDisbursementResponse);

        await disburseAdvance(advance, bankAccount, user, paymentMethod);
        await advance.reload();
        expect(advance.approvalCode).to.equal(approvalCode);
        expect(advance.network).to.equal(settlementNetwork);
        expect(advance.networkId).to.equal(networkId);
      });

      it('should handle when optional network fields are undefined', async () => {
        const settlementNetwork = 'Visa';
        const tabapayDisbursementResponse: ExternalDisbursement = {
          id: '1',
          network: {
            approvalCode: undefined,
            networkId: undefined,
            settlementNetwork,
          },
          status: ExternalTransactionStatus.Completed,
          processor: ExternalTransactionProcessor.Tabapay,
        };
        sandbox.stub(Tabapay, 'disburse').resolves(tabapayDisbursementResponse);

        await disburseAdvance(advance, bankAccount, user, paymentMethod);
        await advance.reload();
        expect(advance.approvalCode).not.to.exist;
        expect(advance.network).to.equal(settlementNetwork);
        expect(advance.networkId).to.not.exist;
      });
    });
  });

  describe('updateAdvance', () => {
    const screenshot = 'screenshot';
    let broadcastAdvanceTipChangedStub: sinon.SinonStub;
    beforeEach(() => {
      sandbox.stub(gcloudStorage, 'saveImageToGCloud').returns('screenie-url');
      broadcastAdvanceTipChangedStub = sandbox.stub(Jobs, 'broadcastAdvanceTipChangedTask');
    });

    it('should update tip percent and screenshot for advance and broadcast ad', async () => {
      const user = await factory.create('user');
      const adv = await factory.create('advance', { userId: user.id });
      await factory.create('advance-tip', { advanceId: adv.id, amount: 2.0 });
      await updateAdvance(adv.id, user.id, 5, '', getAnalyticsData(user.id), screenshot);
      const result = await getAdvanceById(adv.id);

      expect(result.screenshotImage).to.equal('screenie-url');
      expect(broadcastAdvanceTipChangedStub).to.be.calledOnce;
    });

    it('should fail to update completed advances', async () => {
      const user = await factory.create('user');
      const adv = await factory.create('advance', { userId: user.id, outstanding: 0.0 });

      try {
        await updateAdvance(adv.id, user.id, 5, '', getAnalyticsData(user.id), screenshot);
        expect.fail();
      } catch (err) {
        expect(err).to.be.instanceOf(InvalidParametersError);
      }
    });

    it('should fail to update advance tip if there is a pending', async () => {
      const advance = await factory.create<Advance>('advance');
      const initialTipPercent = 15;
      const initialTipAmount = (advance.amount * initialTipPercent) / 100;
      const newTipPercent = 0;
      const [advanceTip] = await Promise.all([
        factory.create<AdvanceTip>('advance-tip', {
          advanceId: advance.id,
          amount: initialTipAmount,
          percent: initialTipPercent,
        }),
        factory.create('payment', {
          advanceId: advance.id,
          status: ExternalTransactionStatus.Pending,
        }),
      ]);
      await expect(
        updateAdvance(
          advance.id,
          advance.userId,
          newTipPercent,
          'user-schedule-payment',
          getAnalyticsData(advance.userId),
          screenshot,
        ),
      ).to.be.rejectedWith(ConflictError, 'Cannot update tip while collection is in progress');
      await advanceTip.reload();
      expect(advanceTip.percent).to.equal(initialTipPercent);
      expect(advanceTip.amount).to.equal(initialTipAmount);
      expect(broadcastAdvanceTipChangedStub).not.to.be.called;
    });
  });

  describe('getAdvancePaymentMap', () => {
    it("should get a map of payments for a user's advances", async () => {
      const user = await factory.create('user');
      const userId = user.id;
      const adv0 = await factory.create('advance', { userId, outstanding: 10 });
      const adv1 = await factory.create('advance', {
        userId,
        createdDate: moment().subtract(1, 'months'),
        outstanding: 20,
      });
      const pay0 = await factory.create('payment', { advanceId: adv0.id });
      const pay1 = await factory.create('payment', { advanceId: adv0.id });
      const pay2 = await factory.create('payment', { advanceId: adv1.id });

      const paymentMap = await getAdvancePaymentMap(userId);
      expect(paymentMap[adv0.id]).to.exist;
      const adv0Payments = paymentMap[adv0.id].map(p => p.id);
      expect(adv0Payments).to.include(pay0.id);
      expect(adv0Payments).to.include(pay1.id);
      expect(paymentMap[adv1.id]).to.exist;
      const adv1Payments = paymentMap[adv1.id].map(p => p.id);
      expect(adv1Payments).to.include(pay2.id);
    });
  });

  describe('getAdvancesByUser', () => {
    it('should return advances for user', async () => {
      const user = await factory.create('user');
      const userId = user.id;
      const adv0 = await factory.create('advance', { userId, outstanding: 10 });
      const adv1 = await factory.create('advance', {
        userId,
        createdDate: moment().subtract(1, 'months'),
        outstanding: 20,
      });

      const advances = await getAdvancesByUser(userId);
      const ids = advances.map(adv => adv.id);

      expect(advances.length).to.equal(2);
      expect(ids).to.include(adv0.id);
      expect(ids).to.include(adv1.id);
    });

    it('should not return canceled or returned advances', async () => {
      const user = await factory.create('user');
      const userId = user.id;
      const adv0 = await factory.create('advance', { userId, outstanding: 10 });
      await factory.create('advance', {
        userId,
        outstanding: 20,
        disbursementStatus: ExternalTransactionStatus.Canceled,
        createdDate: moment().subtract(1, 'months'),
      });
      await factory.create('advance', {
        userId,
        outstanding: 30,
        disbursementStatus: ExternalTransactionStatus.Returned,
        createdDate: moment().subtract(2, 'months'),
      });

      const advances = await getAdvancesByUser(userId);
      expect(advances.length).to.equal(1);
      expect(advances[0].id).to.equal(adv0.id);
    });
  });

  describe('getAdvanceApproval', () => {
    it('should return an array of successful AdvanceApprovalCreateResponse', async () => {
      const user = await factory.create<User>('user');
      const bankAccount = await factory.create<BankAccount>('bank-account', {
        userId: user.id,
        microDeposit: MicroDeposit.COMPLETED,
      });
      const response = [await factory.create('create-approval-success')];
      sandbox.stub(AdvanceApprovalClient, 'createAdvanceApproval').resolves(response);

      const advanceApprovalResponses = await getAdvanceApproval(
        bankAccount.id,
        user,
        50,
        'Advance',
      );
      expect(advanceApprovalResponses.length).to.be.eq(1);
      const advanceApprovalResponse = advanceApprovalResponses[0];
      expect(advanceApprovalResponse).to.deep.eq(response[0]);
    });
  });

  describe('verifyAdvanceAmount', () => {
    it('should not throw an error if the advance amount is 50', () => {
      expect(verifyAdvanceAmount(50)).to.be.undefined;
    });

    it('should throw an InvalidParametersError if the advance amount is NaN', () => {
      expect(() => verifyAdvanceAmount(NaN)).to.throw(
        InvalidParametersError,
        'Invalid advance amount',
      );
    });

    it('should throw an InvalidParametersError if the advance amount is less than 0', () => {
      expect(() => verifyAdvanceAmount(-1)).to.throw(
        InvalidParametersError,
        'Invalid advance amount',
      );
    });

    it('should throw an InvalidParametersError if the advance amount is 0', () => {
      expect(() => verifyAdvanceAmount(0)).to.throw(
        InvalidParametersError,
        'Invalid advance amount',
      );
    });

    it('should throw an InvalidParametersError if the advance amount is more than the max advance amount', () => {
      expect(() => verifyAdvanceAmount(MAX_ADVANCE_AMOUNT + 1)).to.throw(
        InvalidParametersError,
        'Invalid advance amount',
      );
    });
  });

  describe('validatePaybackDate', () => {
    it('throws an error if payback date is the same or before today', () => {
      const userTimezone = 'America/Chicago';
      const today = moment.tz('2021-02-26 00:00:00', userTimezone);
      fakeDateTime(sandbox, today);
      const paybackDate = '2021-02-26';
      const deliveryType = PaymentProviderDelivery.EXPRESS;
      const advanceApproval = {} as AdvanceApprovalGetResponse;

      expect(() =>
        validatePaybackDate({ deliveryType, advanceApproval, paybackDate, userTimezone }),
      ).to.throw(InvalidParametersError, /Payback Date must be in the future/);
    });

    it('does not throw an error when the payback date is today in UTC but still the day before in user time', () => {
      const userTimezone = 'America/Chicago';
      const today = moment.tz('2021-02-25 23:59:00', userTimezone);
      fakeDateTime(sandbox, today);
      const paybackDate = '2021-02-26';
      const deliveryType = PaymentProviderDelivery.EXPRESS;
      const advanceApproval = {} as AdvanceApprovalGetResponse;

      expect(() =>
        validatePaybackDate({ deliveryType, advanceApproval, paybackDate, userTimezone }),
      ).not.to.throw();
    });

    it('does not throw an error when the default payback date is today in UTC but still the day before in user time', () => {
      const userTimezone = 'America/Chicago';
      const today = moment.tz('2021-02-25 23:59:00', userTimezone);
      fakeDateTime(sandbox, today);
      const paybackDate: string = null;
      const deliveryType = PaymentProviderDelivery.EXPRESS;
      const advanceApproval = {
        defaultPaybackDate: '2021-02-26T00:00:00Z',
      } as AdvanceApprovalGetResponse;

      expect(() =>
        validatePaybackDate({ deliveryType, advanceApproval, paybackDate, userTimezone }),
      ).not.to.throw();
    });
  });
});
