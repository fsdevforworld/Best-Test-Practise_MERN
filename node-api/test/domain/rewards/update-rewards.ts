import { Moment, moment } from '@dave-inc/time-lib';
import factory from '../../factories';
import braze from '../../../src/lib/braze';
import { expect } from 'chai';
import { clean } from '../../test-helpers';
import { EmpyrEvent, RewardsLedger, SubscriptionBilling, User } from '../../../src/models';
import updateRewards from '../../../src/domain/rewards/update-rewards';
import * as sinon from 'sinon';

describe('updateRewards()', () => {
  const sandbox = sinon.createSandbox();

  let expectedSubscribedUser: User;
  let expectedSubscriptionStart: Moment;
  let expectedCurrentBill: SubscriptionBilling;
  before(() => clean());

  beforeEach(async () => {
    sandbox.stub(braze, 'track').resolves();
    expectedSubscriptionStart = moment();
    expectedSubscribedUser = await factory.create('subscribed-user', {
      subscriptionStart: expectedSubscriptionStart.startOf('month').format('YYYY-MM-DD'),
    });

    expectedCurrentBill = await factory.create('subscription-billing', {
      userId: expectedSubscribedUser.id,
      start: expectedSubscriptionStart.startOf('month').format('YYYY-MM-DD HH:mm:ss'),
      end: expectedSubscriptionStart.endOf('month').format('YYYY-MM-DD HH:mm:ss'),
      amount: 1.0,
      billingCycle: expectedSubscriptionStart.format('YYYY-MM'),
    });
  });

  afterEach(() => clean(sandbox));

  describe('with $1 reward', () => {
    let expectedEmpyrEvent: EmpyrEvent;
    beforeEach(async () => {
      expectedEmpyrEvent = await factory.create('empyr-event-cleared', {
        userId: expectedSubscribedUser.id,
        rewardAmount: 1.0,
      });

      await updateRewards(expectedEmpyrEvent);
    });

    it('should set subscription_billing record paid', async () => {
      const unpaidBills = await SubscriptionBilling.scope('unpaid').findAll({
        where: {
          userId: expectedSubscribedUser.id,
        },
      });

      expect(unpaidBills).to.be.empty;
    });

    it('should set unpaid subscription_billing record to 0', async () => {
      await expectedCurrentBill.reload();
      expect(expectedCurrentBill.amount).to.equal(0);
    });

    it('should associate empyr event with reward', async () => {
      await expectedCurrentBill.reload();

      const expectedLedgers = await RewardsLedger.findAll({
        where: {
          empyrEventId: expectedEmpyrEvent.id,
        },
      });

      const expectedRewardCredit = expectedLedgers[0];
      const expectedRewardDebit = expectedLedgers[1];

      expect(expectedRewardCredit.empyrEventId).to.equal(expectedEmpyrEvent.id);
      expect(expectedRewardDebit.empyrEventId).to.equal(expectedEmpyrEvent.id);
    });

    it('should give multiple months for additional rewards', async () => {
      const expectedNewEvent = await factory.create('empyr-event-cleared', {
        userId: expectedSubscribedUser.id,
        rewardAmount: 1.0,
      });

      await updateRewards(expectedNewEvent);

      const expectedSuperNewEvent = await factory.create('empyr-event-cleared', {
        userId: expectedSubscribedUser.id,
        rewardAmount: 1.0,
      });

      await updateRewards(expectedSuperNewEvent);

      const expectedBillings = await SubscriptionBilling.findAll({
        where: {
          userId: expectedSubscribedUser.id,
        },
        order: ['billingCycle'],
      });

      expect(expectedBillings[0].amount).to.equal(0);
      expect(expectedBillings[0].billingCycle).to.equal(
        expectedSubscriptionStart.format('YYYY-MM'),
      );
      expect(expectedBillings[1].amount).to.equal(0);
      expect(expectedBillings[1].billingCycle).to.equal(
        expectedSubscriptionStart.add(1, 'months').format('YYYY-MM'),
      );
      expect(expectedBillings[2].amount).to.equal(0);
      expect(expectedBillings[2].billingCycle).to.equal(
        expectedSubscriptionStart.add(1, 'months').format('YYYY-MM'),
      );
    });
  });

  describe('with $2 reward', () => {
    beforeEach(async () => {
      const expectedEmpyrEvent = await factory.create('empyr-event-cleared', {
        userId: expectedSubscribedUser.id,
        rewardAmount: 2.0,
      });

      await updateRewards(expectedEmpyrEvent);
    });

    it('should debit rewards once subscription paid', async () => {
      const resultRewardsBalance = await RewardsLedger.sum('amount', {
        where: {
          userId: expectedSubscribedUser.id,
        },
      });

      expect(resultRewardsBalance).to.equal(0);
    });

    it('should set unpaid billing record to 0 and create new zero billing record of 0', async () => {
      await expectedCurrentBill.reload();

      const expectedNextBill = await SubscriptionBilling.findOne({
        where: {
          userId: expectedSubscribedUser.id,
          billingCycle: expectedSubscriptionStart.add(1, 'months').format('YYYY-MM'),
        },
      });

      expect(expectedCurrentBill.amount).to.equal(0);
      expect(expectedNextBill.amount).to.equal(0);
    });

    it('should associate billing records with reward debit', async () => {
      await expectedCurrentBill.reload();

      const expectedNextBill = await SubscriptionBilling.findOne({
        where: {
          userId: expectedSubscribedUser.id,
          billingCycle: expectedSubscriptionStart.add(1, 'months').format('YYYY-MM'),
        },
      });

      const expectedRewardDebit = await RewardsLedger.findOne({
        where: {
          userId: expectedSubscribedUser.id,
          amount: -2,
        },
      });

      expect(expectedCurrentBill.amount).to.equal(0);
      expect(expectedNextBill.amount).to.equal(0);
      expect(expectedRewardDebit.id).to.equal(expectedCurrentBill.rewardsLedgerId);
      expect(expectedRewardDebit.id).to.equal(expectedNextBill.rewardsLedgerId);
    });
  });

  it('should not pay subscription when balance < $1', async () => {
    const expectedEmpyrEvent = await factory.create('empyr-event-cleared', {
      userId: expectedSubscribedUser.id,
      rewardAmount: 0.5,
    });

    await updateRewards(expectedEmpyrEvent);

    await expectedCurrentBill.reload();

    expect(expectedCurrentBill.amount).to.equal(1);
  });
});
