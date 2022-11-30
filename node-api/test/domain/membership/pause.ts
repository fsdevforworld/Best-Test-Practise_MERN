import { expect, use } from 'chai';
import chaiAsPromised from 'chai-as-promised';
import * as sinon from 'sinon';
import factory from '../../factories';
import { clean, fakeDate } from '../../test-helpers';
import { pause } from '../../../src/domain/membership';
import amplitude from '../../../src/lib/amplitude';
import logger from '../../../src/lib/logger';
import braze from '../../../src/lib/braze';
import { dogstatsd } from '../../../src/lib/datadog-statsd';
import { moment } from '@dave-inc/time-lib';
import {
  AuditLog,
  MembershipPause,
  SubscriptionBilling,
  SubscriptionPayment,
  User,
} from '../../../src/models';
import { serializeDate } from '../../../src/serialization';
import { AnalyticsEvent } from '../../../src/typings';

describe('membership - pause', () => {
  const sandbox = sinon.createSandbox();
  let user: User;
  let amplitudeStub: sinon.SinonStub;
  let brazeStub: sinon.SinonStub;

  before(() => clean());

  beforeEach(() => {
    amplitudeStub = sandbox.stub(amplitude, 'track');
    brazeStub = sandbox.stub(braze, 'track');
  });

  afterEach(() => clean(sandbox));

  describe('pauseMembership', () => {
    beforeEach(async () => {
      user = await factory.create('user', { subscriptionFee: 1 }, { hasSession: true });
    });

    context('when membership is paused and user has not paid current billing cycle', () => {
      let membershipPause: MembershipPause;

      beforeEach(async () => {
        await factory.create('subscription-billing', {
          userId: user.id,
        });

        const membershipPauseResult = await pause(user);
        membershipPause = membershipPauseResult.membershipPause;
      });

      it('should pause the user immediately', async () => {
        expect(membershipPause.userId).to.equal(user.id);
        expect(membershipPause.isActive()).to.be.true;
      });

      it('should set the current billing cycle record to $0', async () => {
        await pause(user);
        const currentSubscriptionBilling = await SubscriptionBilling.findOne({
          where: {
            userId: user.id,
            billingCycle: moment().format('YYYY-MM'),
          },
        });
        expect(currentSubscriptionBilling.amount).to.equal(0);
      });

      it('should save the new membership record in the database', async () => {
        const newMembershipPauseRecord = await MembershipPause.findByPk(membershipPause.id);
        expect(newMembershipPauseRecord.userId).to.equal(user.id);
        expect(newMembershipPauseRecord.isActive()).to.be.true;
      });

      it('should set the subscription fee to 0', async () => {
        await user.reload();
        expect(user.subscriptionFee).to.equal(0);
      });

      it('should create an audit log record, send analytics to amplitude, and send attributes to braze', async () => {
        const auditLogRecord = await AuditLog.findOne({
          where: {
            userId: user.id,
          },
        });
        expect(Number(auditLogRecord.eventUuid)).to.equal(membershipPause.id);
        expect(auditLogRecord.type).to.equal('MEMBERSHIP_PAUSED');
        expect(auditLogRecord.extra.pauseRecord).to.have.all.keys(
          'id',
          'userId',
          'created',
          'updated',
          'pausedAt',
          'unpausedAt',
        );
        sinon.assert.calledWithExactly(amplitudeStub, {
          userId: user.id,
          eventType: AnalyticsEvent.AccountPaused,
          eventProperties: {
            is_paused_immediately: true,
            is_free_month: false,
            pause_start_date: serializeDate(membershipPause.pausedAt),
          },
          userProperties: { is_paused: true },
        });
        sinon.assert.calledWithExactly(brazeStub, {
          attributes: [
            {
              externalId: `${user.id}`,
              isPaused: true,
            },
          ],
          events: [
            {
              externalId: `${user.id}`,
              name: AnalyticsEvent.AccountPaused,
              time: moment(membershipPause.created),
              properties: {
                pauseStartDate: serializeDate(membershipPause.pausedAt),
              },
            },
          ],
        });
      });
    });

    context('when membership is paused and user has already paid current billing cycle', () => {
      let membershipPause: MembershipPause;

      beforeEach(async () => {
        const now = '2020-01-15';
        fakeDate(sandbox, now);

        const billing = await factory.create<SubscriptionBilling>('subscription-billing', {
          userId: user.id,
        });

        const payment = await factory.create<SubscriptionPayment>('subscription-payment', {
          userId: user.id,
        });

        await factory.create('subscription-payment-line-item', {
          subscriptionBillingId: billing.id,
          subscriptionPaymentId: payment.id,
        });

        const membershipPauseResult = await pause(user);
        membershipPause = membershipPauseResult.membershipPause;
      });

      it('should not pause the user immediately', async () => {
        expect(membershipPause.userId).to.equal(user.id);
        expect(membershipPause.isActive()).to.be.false;
      });

      it('should set the subscription fee to 0', async () => {
        await user.reload();
        expect(user.subscriptionFee).to.equal(0);
      });

      it('should not set the current billing cycle record to $0', async () => {
        const currentSubscriptionBilling = await SubscriptionBilling.findOne({
          where: {
            userId: user.id,
            billingCycle: '2020-01',
          },
        });
        expect(currentSubscriptionBilling.amount).to.equal(1);
      });

      it('should save the new membership record in the database', async () => {
        const newMembershipPauseRecord = await MembershipPause.findByPk(membershipPause.id);
        expect(newMembershipPauseRecord.userId).to.equal(user.id);
        expect(newMembershipPauseRecord.isActive()).to.be.false;
      });

      it('should create an audit log record and send analytics to amplitude', async () => {
        const auditLogRecord = await AuditLog.findOne({
          where: {
            userId: user.id,
          },
        });
        expect(Number(auditLogRecord.eventUuid)).to.equal(membershipPause.id);
        expect(auditLogRecord.type).to.equal('MEMBERSHIP_PAUSED');
        expect(auditLogRecord.extra.pauseRecord).to.have.all.keys(
          'id',
          'userId',
          'created',
          'updated',
          'pausedAt',
          'unpausedAt',
        );
        sinon.assert.calledWithExactly(amplitudeStub, {
          userId: user.id,
          eventType: AnalyticsEvent.AccountPaused,
          eventProperties: {
            is_paused_immediately: false,
            is_free_month: false,
            pause_start_date: serializeDate(membershipPause.pausedAt),
          },
          userProperties: { is_paused: true },
        });
        sinon.assert.calledWithExactly(brazeStub, {
          attributes: [
            {
              externalId: `${user.id}`,
              isPaused: true,
            },
          ],
          events: [
            {
              externalId: `${user.id}`,
              name: AnalyticsEvent.AccountPaused,
              time: moment(membershipPause.created),
              properties: {
                pauseStartDate: serializeDate(membershipPause.pausedAt),
              },
            },
          ],
        });
      });
    });

    context('when membership is paused and user has free months', () => {
      let membershipPause: MembershipPause;

      beforeEach(async () => {
        await factory.create('subscription-billing', {
          userId: user.id,
          amount: 0,
        });

        const membershipPauseResult = await pause(user);
        membershipPause = membershipPauseResult.membershipPause;
      });

      it('should not pause the user immediately', async () => {
        expect(membershipPause.userId).to.equal(user.id);
        expect(membershipPause.isActive()).to.be.false;
      });

      it('should set the subscription fee to 0', async () => {
        await user.reload();
        expect(user.subscriptionFee).to.equal(0);
      });

      it('should save the new membership record in the database', async () => {
        const newMembershipPauseRecord = await MembershipPause.findByPk(membershipPause.id);
        expect(newMembershipPauseRecord.userId).to.equal(user.id);
        expect(newMembershipPauseRecord.isActive()).to.be.false;
      });

      it('should create an audit log record and send analytics to amplitude', async () => {
        const auditLogRecord = await AuditLog.findOne({
          where: {
            userId: user.id,
          },
        });
        expect(Number(auditLogRecord.eventUuid)).to.equal(membershipPause.id);
        expect(auditLogRecord.type).to.equal('MEMBERSHIP_PAUSED');
        expect(auditLogRecord.extra.pauseRecord).to.have.all.keys(
          'id',
          'userId',
          'created',
          'updated',
          'pausedAt',
          'unpausedAt',
        );
        sinon.assert.calledWithExactly(amplitudeStub, {
          userId: user.id,
          eventType: AnalyticsEvent.AccountPaused,
          eventProperties: {
            is_paused_immediately: false,
            is_free_month: true,
            pause_start_date: serializeDate(membershipPause.pausedAt),
          },
          userProperties: { is_paused: true },
        });
        sinon.assert.calledWithExactly(brazeStub, {
          attributes: [
            {
              externalId: `${user.id}`,
              isPaused: true,
            },
          ],
          events: [
            {
              externalId: `${user.id}`,
              name: AnalyticsEvent.AccountPaused,
              time: moment(membershipPause.created),
              properties: {
                pauseStartDate: serializeDate(membershipPause.pausedAt),
              },
            },
          ],
        });
      });
    });

    context('error handling', () => {
      it('should throw an error if current subscription billing is not found', async () => {
        use(() => chaiAsPromised);
        const datadogSpy = sandbox.spy(dogstatsd, 'increment');
        const loggerStub = sandbox.stub(logger, 'error');
        await expect(pause(user)).to.be.rejectedWith('System update. Please try again.');
        sinon.assert.calledOnce(datadogSpy);
        sinon.assert.calledOnce(loggerStub);
      });

      it('should throw a forbidden error if user has an outstanding advance', async () => {
        await factory.create('advance', { userId: user.id });
        let isSuccess;
        try {
          await pause(user);
          isSuccess = true;
        } catch (error) {
          expect(error.statusCode).to.equal(403);
          expect(error.message).to.match(/OutstandingAdvancePause/);
        }

        if (isSuccess) {
          throw new Error('membership pause succeeded, but should of errored');
        }
      });

      it('should fail without throwing an error if an immediately paused membership record already exists for the user', async () => {
        await factory.create('subscription-billing', {
          userId: user.id,
        });
        await pause(user);

        const { success, membershipPause, msg } = await pause(user);

        expect(success).to.equal(false);
        expect(membershipPause).to.equal(undefined);
        // this code doesn't throw the error yet, so the middleware has not yet converted
        // the error key to a human-readable message
        expect(msg).to.equal('MembershipAlreadyPaused');
      });

      it('should fail without throwing an error if an upcoming paused membership record already exists for the user', async () => {
        const billing = await factory.create<SubscriptionBilling>('subscription-billing', {
          userId: user.id,
        });

        const payment = await factory.create<SubscriptionPayment>('subscription-payment', {
          userId: user.id,
        });

        await factory.create('subscription-payment-line-item', {
          subscriptionBillingId: billing.id,
          subscriptionPaymentId: payment.id,
        });

        const { membershipPause: firstPause } = await pause(user);
        const { success, membershipPause, interpolations } = await pause(user);
        const expectedPauseDate = firstPause.pausedAt.format('YYYY-MM-DD');
        expect(success).to.equal(false);
        expect(membershipPause).to.equal(undefined);
        expect(interpolations.pauseDate).to.equal(expectedPauseDate);
      });
    });
  });
});
