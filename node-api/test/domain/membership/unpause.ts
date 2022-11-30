import { expect } from 'chai';
import * as sinon from 'sinon';
import factory from '../../factories';
import { clean, fakeDate } from '../../test-helpers';
import { unpause } from '../../../src/domain/membership';
import amplitude from '../../../src/lib/amplitude';
import braze from '../../../src/lib/braze';
import { moment } from '@dave-inc/time-lib';
import { AuditLog, MembershipPause, SubscriptionBilling, User } from '../../../src/models';
import { serializeDate } from '../../../src/serialization';
import { AnalyticsEvent } from '../../../src/typings';

describe('membership - unpause', () => {
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

  describe('unpause membership', () => {
    beforeEach(async () => {
      user = await factory.create('user', { subscriptionFee: 0 }, { hasSession: true });
    });

    context('when membership is unpaused', async () => {
      let membershipPause: MembershipPause;
      let subscriptionBilling: SubscriptionBilling;

      beforeEach(async () => {
        subscriptionBilling = await factory.create('subscription-billing', {
          userId: user.id,
          amount: 0,
        });

        membershipPause = await factory.create('membership-pause', {
          userId: user.id,
        });
      });

      it('should set the subscription fee to 1', async () => {
        await unpause(user);
        await user.reload();
        expect(user.subscriptionFee).to.equal(1);
      });

      it('should return the updated membership pause record if you unpause after your membership pause is active', async () => {
        const now = '2019-12-02';
        fakeDate(sandbox, now);

        await factory.create('subscription-billing', {
          userId: user.id,
          amount: 0,
          billingCycle: '2019-12',
        });
        await membershipPause.update({ pausedAt: moment(now).subtract(30, 'days') });
        await unpause(user);
        await membershipPause.reload();

        expect(membershipPause.isActive()).to.be.false;
        expect(membershipPause.userId).to.equal(user.id);
        expect(membershipPause.unpausedAt).to.be.sameMoment(moment(now));
      });

      it('should return the updated membership pause record if you unpause before your membership pause is active', async () => {
        const now = '2019-12-06';
        fakeDate(sandbox, now);
        const created = moment(now).subtract(1, 'day');

        await factory.create('subscription-billing', {
          userId: user.id,
          amount: 0,
          billingCycle: '2019-12',
        });
        await membershipPause.update({
          pausedAt: created.add(1, 'month').startOf('month'),
          created,
        });
        await unpause(user);
        await membershipPause.reload();

        expect(membershipPause.isActive()).to.be.false;
        expect(membershipPause.userId).to.equal(user.id);
        expect(membershipPause.unpausedAt).to.be.sameMoment(moment(now));
      });

      it('should set the current subscription billing to $1 if there are more than 10 day left in the month', async () => {
        fakeDate(sandbox, '2019-12-02');

        await subscriptionBilling.update({
          userId: user.id,
          amount: 0,
          billingCycle: '2019-12',
        });

        await unpause(user);
        const currentSubscriptionBilling = await SubscriptionBilling.findOne({
          where: {
            userId: user.id,
            billingCycle: moment().format('YYYY-MM'),
          },
        });
        expect(currentSubscriptionBilling.amount).to.equal(1);
      });

      it('should send the amplitude event and braze attributes', async () => {
        await unpause(user);
        await membershipPause.reload();
        sinon.assert.calledWithExactly(amplitudeStub, {
          userId: user.id,
          eventType: AnalyticsEvent.AccountUnpaused,
          eventProperties: { pause_end_date: serializeDate(membershipPause.unpausedAt) },
          userProperties: { is_paused: false },
        });
        sinon.assert.calledWithExactly(brazeStub, {
          attributes: [
            {
              externalId: `${user.id}`,
              isPaused: false,
            },
          ],
          events: [
            {
              name: AnalyticsEvent.AccountUnpaused,
              externalId: `${user.id}`,
              time: membershipPause.unpausedAt,
            },
          ],
        });
      });

      it('should create an audit log record', async () => {
        await unpause(user);
        await membershipPause.reload();
        const auditLogRecord = await AuditLog.findOne({
          where: {
            userId: user.id,
          },
        });

        expect(Number(auditLogRecord.eventUuid)).to.equal(membershipPause.id);
        expect(auditLogRecord.type).to.equal('MEMBERSHIP_UNPAUSED');
        expect(auditLogRecord.extra.pauseRecord).to.have.all.keys(
          'id',
          'userId',
          'pausedAt',
          'unpausedAt',
          'created',
          'updated',
        );
      });
    });

    it('should not update the subscription billing record for the current billing cycle if less than 10 days left in the month', async () => {
      const now = '2020-01-26';
      fakeDate(sandbox, now);
      await Promise.all([
        factory.create('subscription-billing', {
          userId: user.id,
          amount: 0,
          billingCycle: '2020-01',
        }),
        factory.create('membership-pause', {
          userId: user.id,
          pausedAt: moment('2019-12-05'),
        }),
      ]);
      await unpause(user);
      const currentSubscriptionBilling = await SubscriptionBilling.findOne({
        where: {
          userId: user.id,
          billingCycle: '2020-01',
        },
      });
      expect(currentSubscriptionBilling.amount).to.equal(0);
    });

    it('should roll back previous queries when another query in the transaction fails', async () => {
      let userSubscriptionFee: number;

      await factory.create('membership-pause', {
        userId: user.id,
      });

      sandbox.stub(MembershipPause.prototype, 'update').rejects();

      // Manually set the subscription fee to arbitrary $5 in order to test the revert in the transaction
      await user.update({ subscriptionFee: 5 });

      try {
        await unpause(user);
      } catch (error) {
        // Verify that the user's subscription fee is reverted to last amount
        await user.reload();
        userSubscriptionFee = user.subscriptionFee;
      }

      expect(userSubscriptionFee).to.equal(5);
      expect(amplitudeStub).to.have.callCount(0);
    });
  });
});
