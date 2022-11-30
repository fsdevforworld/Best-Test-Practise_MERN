import factory from '../../factories';
import { moment } from '@dave-inc/time-lib';
import { expect } from 'chai';
import { clean } from '../../test-helpers';
import { RewardsLedger, User } from '../../../src/models';
import fetchRewards from '../../../src/domain/rewards/fetch-rewards';
import { UserReward } from '@dave-inc/wire-typings';

describe('fetchRewards', () => {
  let expectedUser: User;

  before(() => clean());

  beforeEach(async () => {
    expectedUser = await factory.create('user');
  });

  afterEach(() => clean());

  it('handles no data', async () => {
    const expectedResult: UserReward = {
      progress: 0,
      membershipsEarned: 0,
    };

    const result = await fetchRewards(expectedUser.id);

    expect(result).to.deep.equal(expectedResult);
  });

  it('returns correct data for single reward-paid membership', async () => {
    const expectedReward: RewardsLedger = await factory.create('rewards-ledger', {
      userId: expectedUser.id,
      amount: 1,
    });

    await factory.create('subscription-billing', {
      amount: 0,
      userId: expectedUser.id,
      rewardsLedgerId: expectedReward.id,
    });

    const expectedResult: UserReward = {
      progress: 0,
      membershipsEarned: 1,
    };

    const result = await fetchRewards(expectedUser.id);

    expect(result).to.deep.equal(expectedResult);
  });

  it('returns correct progress', async () => {
    const expectedReward: RewardsLedger = await factory.create('rewards-ledger', {
      userId: expectedUser.id,
      amount: 1.33,
    });

    await factory.create('subscription-billing', {
      amount: 0,
      userId: expectedUser.id,
      rewardsLedgerId: expectedReward.id,
    });

    const expectedResult: UserReward = {
      progress: 0.33,
      membershipsEarned: 1,
    };

    const result = await fetchRewards(expectedUser.id);

    expect(result).to.deep.equal(expectedResult);
  });

  it('handles multiple earned months', async () => {
    const expectedReward: RewardsLedger = await factory.create('rewards-ledger', {
      userId: expectedUser.id,
      amount: 3.66,
    });

    // Rewards debit when redemption occurs
    await factory.create('rewards-ledger', {
      userId: expectedUser.id,
      amount: -3.0,
    });

    const monthBefore = moment().subtract(1, 'month');
    await factory.create('subscription-billing', {
      userId: expectedUser.id,
      rewardsLedgerId: expectedReward.id,
      amount: 0,
      start: monthBefore.startOf('month').format('YYYY-MM-DD'),
      end: monthBefore.endOf('month').format('YYYY-MM-DD'),
      billingCycle: monthBefore.format('YYYY-MM'),
    });

    await factory.create('subscription-billing', {
      amount: 0,
      userId: expectedUser.id,
      rewardsLedgerId: expectedReward.id,
    });

    const monthFromNow = moment().add(1, 'month');
    await factory.create('subscription-billing', {
      userId: expectedUser.id,
      rewardsLedgerId: expectedReward.id,
      amount: 0,
      start: monthFromNow.startOf('month').format('YYYY-MM-DD'),
      end: monthFromNow.endOf('month').format('YYYY-MM-DD'),
      billingCycle: monthFromNow.format('YYYY-MM'),
    });

    const expectedResult: UserReward = {
      progress: 0.66,
      membershipsEarned: 3,
    };

    const result = await fetchRewards(expectedUser.id);

    expect(result).to.deep.equal(expectedResult);
  });
});
