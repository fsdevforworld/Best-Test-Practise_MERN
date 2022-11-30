import { expect, use } from 'chai';
import chaiAsPromised from 'chai-as-promised';
import * as sinon from 'sinon';
import factory from '../../../factories';
import { clean, fakeDate } from '../../../test-helpers';
import {
  AuditLog,
  RedeemedSubscriptionBillingPromotion,
  SubscriptionBilling,
} from '../../../../src/models';
import { ConflictError } from '../../../../src/lib/error';
import { moment, MOMENT_FORMATS } from '@dave-inc/time-lib';
import {
  ensureRedeemable,
  getRedeemableSubscriptionBillingPromotions,
  redeemCovid19JoblossSupport,
  redeemSubscriptionBillingPromotion,
} from '../../../../src/api/v2/subscription-billing-promotion/controller';
import amplitude from '../../../../src/lib/amplitude';
import braze from '../../../../src/lib/braze';
import { FreeMonthSourceName } from '../../../../src/typings/enums';
import { AnalyticsEvent } from '../../../../src/typings';

describe('Subscription Billing Promotion Controller', () => {
  const sandbox = sinon.createSandbox();
  let amplitudeTrackStub: sinon.SinonStub;
  let brazeTrackStub: sinon.SinonStub;

  before(() => clean());

  beforeEach(() => {
    amplitudeTrackStub = sandbox.stub(amplitude, 'track').resolves();
    brazeTrackStub = sandbox.stub(braze, 'track').resolves();
  });

  afterEach(() => clean(sandbox));

  describe('ensrueRedeemable', () => {
    it('should throw if promotion is already redeemed', async () => {
      const [user, subscriptionBillingPromotion] = await Promise.all([
        factory.create('user', {}, { hasSession: true }),
        factory.create('subscription-billing-promotion', {
          description: '3 Free Months',
          code: '3FreeMonths',
          months: 3,
        }),
      ]);

      await factory.create('redeemed-subscription-billing-promotion', {
        userId: user.id,
        subscriptionBillingPromotionId: subscriptionBillingPromotion.id,
      });

      try {
        await ensureRedeemable(user.id, subscriptionBillingPromotion.id);
        expect(false);
      } catch (error) {
        expect(error).instanceOf(ConflictError);
      }
    });
  });

  describe('getRedeemableSubscriptionBillingPromotions', () => {
    it('should return only the SubscriptionBillingPromotions that the user has not redeemed', async () => {
      const [
        user,
        subscriptionBillingPromotion,
        otherSubscriptionBillingPromotion,
      ] = await Promise.all([
        factory.create('user', {}, { hasSession: true }),
        factory.create('subscription-billing-promotion', {
          description: '3 Free Months',
          code: '3FreeMonths',
          months: 3,
        }),
        factory.create('subscription-billing-promotion', {
          description: '4 Free Months',
          code: '4FreeMonths',
          months: 4,
        }),
      ]);

      await factory.create('redeemed-subscription-billing-promotion', {
        userId: user.id,
        subscriptionBillingPromotionId: subscriptionBillingPromotion.id,
      });

      const redeemableSubscriptionBillingPromotions = await getRedeemableSubscriptionBillingPromotions(
        user.id,
      );

      expect(redeemableSubscriptionBillingPromotions.length).to.eq(1);
      expect(redeemableSubscriptionBillingPromotions[0].id).to.eq(
        otherSubscriptionBillingPromotion.id,
      );
    });
  });

  describe('redeemSubscriptionBillingPromotion', () => {
    it('should create free billings for the next 3 months when the current month has been paid', async () => {
      const [user, subscriptionBillingPromotion] = await Promise.all([
        factory.create('user', {}, { hasSession: true }),
        factory.create('subscription-billing-promotion', {
          description: '3 Free Months',
          code: '3FreeMonths',
          months: 3,
        }),
      ]);
      fakeDate(sandbox, '2020-01-15');

      const [billing, payment] = await Promise.all([
        factory.create('subscription-billing', {
          userId: user.id,
        }),
        factory.create('subscription-payment', {
          userId: user.id,
        }),
      ]);

      await factory.create('subscription-payment-line-item', {
        subscriptionBillingId: billing.id,
        subscriptionPaymentId: payment.id,
      });

      await redeemSubscriptionBillingPromotion(subscriptionBillingPromotion, user.id);

      await user.reload();
      const [redeemedSubscriptionBillingPromotion, auditLogRecord] = await Promise.all([
        RedeemedSubscriptionBillingPromotion.findOne({
          where: {
            userId: user.id,
            subscriptionBillingPromotionId: subscriptionBillingPromotion.id,
          },
        }),
        AuditLog.findOne({ where: { userId: user.id } }),
      ]);
      const auditLogSubscriptionIds = auditLogRecord.extra.subscriptionBillingIds;
      const [subscriptionBillings] = await Promise.all([
        SubscriptionBilling.findAll({
          where: {
            id: auditLogSubscriptionIds,
          },
        }),
      ]);

      expect(auditLogRecord.type).to.equal(AuditLog.TYPES.REDEEMED_SUBSCRIPTION_BILLING_PROMOTION);
      expect(auditLogRecord.extra.subscriptionBillingPromotionCode).to.eq(
        subscriptionBillingPromotion.code,
      );

      expect(redeemedSubscriptionBillingPromotion.userId).to.eq(user.id);
      expect(redeemedSubscriptionBillingPromotion.subscriptionBillingPromotionId).to.eq(
        subscriptionBillingPromotion.id,
      );

      expect(subscriptionBillings.length).to.eq(3);
      subscriptionBillings.forEach(subscriptionBilling => {
        expect(subscriptionBilling.amount).to.eq(0);
      });
      expect(subscriptionBillings.find((sb: SubscriptionBilling) => sb.billingCycle === '2020-02'))
        .to.exist;
      expect(subscriptionBillings.find((sb: SubscriptionBilling) => sb.billingCycle === '2020-03'))
        .to.exist;
      expect(subscriptionBillings.find((sb: SubscriptionBilling) => sb.billingCycle === '2020-04'))
        .to.exist;

      // analytics track events
      expect(amplitudeTrackStub).to.have.callCount(3);
      expect(brazeTrackStub).to.have.callCount(3);

      const userId = user.id;
      const eventType = AnalyticsEvent.FreeMonthEarned;
      const sourceType = FreeMonthSourceName.Promotion;
      const properties = {
        source: subscriptionBillingPromotion.code,
        sourceType,
        month: subscriptionBillings[0].start.startOf('month').format('MMMM'),
      };

      expect(amplitudeTrackStub.firstCall.args[0]).to.deep.equal({
        userId,
        eventType,
        eventProperties: properties,
      });
      const brazeFirstCallArgs = brazeTrackStub.firstCall.args[0].events[0];
      expect(brazeFirstCallArgs.properties).to.deep.equal(properties);
      expect(brazeFirstCallArgs.name).to.deep.equal(eventType);
      expect(brazeFirstCallArgs.externalId).to.equal(userId.toString());
    });

    it('should properly roll back new SubscriptionBillings if creating a RedeemedSubscriptionBillingPromotion fails', async () => {
      use(() => chaiAsPromised);
      const [user, subscriptionBillingPromotion] = await Promise.all([
        factory.create('user', {}, { hasSession: true }),
        factory.create('subscription-billing-promotion', {
          description: '3 Free Months',
          code: '3FreeMonths',
          months: 3,
        }),
      ]);
      fakeDate(sandbox, '2020-01-15');
      sandbox.stub(RedeemedSubscriptionBillingPromotion, 'create').throwsException();

      const [billing, payment] = await Promise.all([
        factory.create('subscription-billing', {
          userId: user.id,
        }),
        factory.create('subscription-payment', {
          userId: user.id,
        }),
      ]);

      await factory.create('subscription-payment-line-item', {
        subscriptionBillingId: billing.id,
        subscriptionPaymentId: payment.id,
      });

      await expect(redeemSubscriptionBillingPromotion(subscriptionBillingPromotion, user.id)).to.be
        .rejected;

      const [subscriptionBillings, redeemedSubscriptionBillingPromotion] = await Promise.all([
        SubscriptionBilling.findAll({ where: { userId: user.id } }),
        RedeemedSubscriptionBillingPromotion.findOne({ where: { userId: user.id } }),
      ]);

      expect(subscriptionBillings.length).to.eq(1);
      expect(subscriptionBillings[0].id).to.eq(billing.id);
      expect(redeemedSubscriptionBillingPromotion).to.be.null;

      const auditLogRecord = await AuditLog.findOne({ where: { userId: user.id } });
      expect(auditLogRecord.successful).to.eq(false);
      expect(auditLogRecord.type).to.equal(AuditLog.TYPES.REDEEMED_SUBSCRIPTION_BILLING_PROMOTION);
      expect(auditLogRecord.extra.subscriptionBillingPromotionCode).to.eq(
        subscriptionBillingPromotion.code,
      );
    });

    it('should set current month to free and add 2 free months when current month has not been paid', async () => {
      const [user, subscriptionBillingPromotion] = await Promise.all([
        factory.create('user', {}, { hasSession: true }),
        factory.create('subscription-billing-promotion', {
          description: '3 Free Months',
          code: '3FreeMonths',
          months: 3,
        }),
      ]);
      fakeDate(sandbox, '2020-01-29');

      await factory.create('subscription-billing', {
        userId: user.id,
      });

      await redeemSubscriptionBillingPromotion(subscriptionBillingPromotion, user.id);

      await user.reload();
      const [redeemedSubscriptionBillingPromotion, auditLogRecord] = await Promise.all([
        RedeemedSubscriptionBillingPromotion.findOne({
          where: {
            userId: user.id,
            subscriptionBillingPromotionId: subscriptionBillingPromotion.id,
          },
        }),
        AuditLog.findOne({ where: { userId: user.id } }),
      ]);
      const auditLogSubscriptionIds = auditLogRecord.extra.subscriptionBillingIds;
      const [subscriptionBillings] = await Promise.all([
        SubscriptionBilling.findAll({
          where: {
            id: auditLogSubscriptionIds,
          },
        }),
      ]);

      expect(auditLogRecord.type).to.equal(AuditLog.TYPES.REDEEMED_SUBSCRIPTION_BILLING_PROMOTION);
      expect(auditLogRecord.extra.subscriptionBillingPromotionCode).to.eq(
        subscriptionBillingPromotion.code,
      );
      subscriptionBillings.forEach(subscriptionBilling => {
        expect(auditLogSubscriptionIds).to.include(subscriptionBilling.id);
      });

      expect(redeemedSubscriptionBillingPromotion.userId).to.eq(user.id);
      expect(redeemedSubscriptionBillingPromotion.subscriptionBillingPromotionId).to.eq(
        subscriptionBillingPromotion.id,
      );

      expect(subscriptionBillings.length).to.eq(3);
      subscriptionBillings.forEach(subscriptionBilling => {
        expect(subscriptionBilling.amount).to.eq(0);
      });
      expect(subscriptionBillings.find((b: SubscriptionBilling) => b.billingCycle === '2020-01')).to
        .exist;
      expect(subscriptionBillings.find((b: SubscriptionBilling) => b.billingCycle === '2020-02')).to
        .exist;
      expect(subscriptionBillings.find((b: SubscriptionBilling) => b.billingCycle === '2020-03')).to
        .exist;
    });

    it('should add three months of free billings after current free months', async () => {
      const now = moment('2020-01-15');
      const [user, subscriptionBillingPromotion] = await Promise.all([
        factory.create('user', {}, { hasSession: true }),
        factory.create('subscription-billing-promotion', {
          description: '3 Free Months',
          code: '3FreeMonths',
          months: 3,
        }),
      ]);
      const userId = user.id;
      const firstFreeMonth = now.clone().add(1, 'month');
      const secondFreeMonth = now.clone().add(2, 'month');
      await Promise.all([
        factory.create('subscription-billing', {
          userId,
          amount: 0,
          start: firstFreeMonth,
          billingCycle: firstFreeMonth.format(MOMENT_FORMATS.YEAR_MONTH),
        }),
        factory.create('subscription-billing', {
          userId,
          amount: 0,
          start: secondFreeMonth,
          billingCycle: secondFreeMonth.format(MOMENT_FORMATS.YEAR_MONTH),
        }),
      ]);

      await redeemSubscriptionBillingPromotion(subscriptionBillingPromotion, user.id);

      await user.reload();
      const auditLogRecord = await AuditLog.findOne({ where: { userId: user.id } });
      const auditLogSubscriptionIds = auditLogRecord.extra.subscriptionBillingIds;
      const subscriptionBillings = await SubscriptionBilling.findAll({
        where: {
          id: auditLogSubscriptionIds,
        },
      });

      expect(auditLogRecord.type).to.equal(AuditLog.TYPES.REDEEMED_SUBSCRIPTION_BILLING_PROMOTION);
      expect(auditLogRecord.extra.subscriptionBillingPromotionCode).to.eq(
        subscriptionBillingPromotion.code,
      );
      subscriptionBillings.forEach(subscriptionBilling => {
        expect(auditLogSubscriptionIds).to.include(subscriptionBilling.id);
      });

      expect(subscriptionBillings.length).to.eq(3);
      subscriptionBillings.forEach(subscriptionBilling => {
        expect(subscriptionBilling.amount).to.eq(0);
      });
      expect(subscriptionBillings.find((b: SubscriptionBilling) => b.billingCycle === '2020-04')).to
        .exist;
      expect(subscriptionBillings.find((b: SubscriptionBilling) => b.billingCycle === '2020-05')).to
        .exist;
      expect(subscriptionBillings.find((b: SubscriptionBilling) => b.billingCycle === '2020-06')).to
        .exist;
    });
  });

  describe('redeemCovid19JoblossSupport', () => {
    beforeEach(async () => {
      await factory.create('subscription-billing-promotion', {
        code: 'COVID_19_JOBLOSS',
        months: 2,
      });
    });

    it('should redeem subscription billing months', async () => {
      const user = await factory.create('user');
      const [billing, payment] = await Promise.all([
        factory.create('subscription-billing', {
          userId: user.id,
        }),
        factory.create('subscription-payment', {
          userId: user.id,
        }),
      ]);

      await factory.create('subscription-payment-line-item', {
        subscriptionBillingId: billing.id,
        subscriptionPaymentId: payment.id,
      });

      const billingSpy = sandbox.spy(SubscriptionBilling, 'bulkCreate');
      await redeemCovid19JoblossSupport(user.id, {});

      sandbox.assert.calledOnce(billingSpy);
      const [subscriptionBillingData] = billingSpy.getCall(0).args;

      expect(subscriptionBillingData.length).to.equal(2);
      expect(subscriptionBillingData[0].amount).to.equal(0);
      expect(subscriptionBillingData[1].amount).to.equal(0);
    });

    it('should create audit log for redemption', async () => {
      const user = await factory.create('user');
      await factory.create('subscription-billing', {
        userId: user.id,
      });
      const auditLog = sandbox.stub(AuditLog, 'create');

      const extra = { foo: 'bar' };
      await redeemCovid19JoblossSupport(user.id, extra);

      sandbox.assert.calledTwice(auditLog);

      const [args] = auditLog.getCall(1).args;
      expect(args.userId).to.equal(user.id);
      expect(args.type).to.equal(AuditLog.TYPES.COVID_19_JOBLOSS);
      expect(args.extra.foo).to.equal('bar');
      expect(args.extra.timestamp).to.exist;
    });

    it('should create braze event for redemption', async () => {
      const user = await factory.create('user');
      await factory.create('subscription-billing', {
        userId: user.id,
      });

      const extra = { foo: 'bar' };
      await redeemCovid19JoblossSupport(user.id, extra);

      sandbox.assert.calledTwice(brazeTrackStub);

      const [{ events }] = brazeTrackStub.getCall(1).args;
      expect(events[0].name).to.equal(AnalyticsEvent.Covid19Jobloss);
      expect(events[0].externalId).to.equal(String(user.id));
      expect(events[0].properties).to.equal(extra);
      expect(events[0].time).to.exist;
    });
  });
});
