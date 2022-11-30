import * as Bluebird from 'bluebird';
import { expect } from 'chai';
import * as sinon from 'sinon';
import OneTimePayment from '../../../src/crons/flag-fraudulent-activity/one-time-payments';
import { Moment } from 'moment';
import { moment } from '@dave-inc/time-lib';
import { User } from '../../../src/models';
import { AdvanceCollectionTrigger } from '../../../src/typings';
import factory from '../../factories';
import { clean } from '../../test-helpers';

describe('flag fraudulent one-time-payment activity', () => {
  const sandbox = sinon.createSandbox();

  beforeEach(() => clean(sandbox));
  after(() => clean(sandbox));

  async function createUserCollectionAttempts(
    dates: Moment[],
    trigger: AdvanceCollectionTrigger,
    isFailedAttempt: boolean = false,
  ): Promise<User> {
    const user = await factory.create('user');

    const advance = await factory.create('advance', {
      userId: user.id,
      amount: 75,
      outstanding: 75,
    });

    await Bluebird.map(dates, date =>
      factory.create('advance-collection-attempt', {
        advanceId: advance.id,
        paymentId: null,
        processing: null,
        created: date,
        trigger,
        extra: isFailedAttempt ? {} : null,
      }),
    );

    return user;
  }

  function createDates(offsets: number[]): Moment[] {
    return offsets.map(offset => moment().add(offset, 'days'));
  }

  it('should find users with too many recent one-time payments', async () => {
    const user0 = await createUserCollectionAttempts(
      createDates([-1, -2]),
      AdvanceCollectionTrigger.USER_ONE_TIME_CARD,
    );
    const user1 = await createUserCollectionAttempts(
      createDates([-1, -2, -3]),
      AdvanceCollectionTrigger.USER_ONE_TIME_CARD,
    );

    const results = await OneTimePayment.queryOneTimePaymentCount(2, 30, moment());

    expect(results.length).to.equal(2);
    expect(results[0].userId).to.equal(user0.id);
    expect(results[0].eventCount).to.equal(2);
    expect(results[1].userId).to.equal(user1.id);
    expect(results[1].eventCount).to.equal(3);
  });

  it('should find users with too many recent one-time payment attempts', async () => {
    const user0 = await createUserCollectionAttempts(
      createDates([-1, -2, -5]),
      AdvanceCollectionTrigger.USER_ONE_TIME_CARD,
      true,
    );
    const user1 = await createUserCollectionAttempts(
      createDates([-1, -2, -5, -10]),
      AdvanceCollectionTrigger.USER_ONE_TIME_CARD,
      true,
    );

    const results = await OneTimePayment.queryOneTimePaymentAttemptCount(2, 30, moment());

    expect(results.length).to.equal(2);
    expect(results[0].userId).to.equal(user0.id);
    expect(results[0].eventCount).to.equal(3);
    expect(results[1].userId).to.equal(user1.id);
    expect(results[1].eventCount).to.equal(4);
  });

  it('should not include events outside time window', async () => {
    await createUserCollectionAttempts(
      createDates([-10, -30]),
      AdvanceCollectionTrigger.USER_ONE_TIME_CARD,
    );
    const user1 = await createUserCollectionAttempts(
      createDates([-5, -10, -30]),
      AdvanceCollectionTrigger.USER_ONE_TIME_CARD,
    );

    const results = await OneTimePayment.queryOneTimePaymentCount(2, 15, moment());

    expect(results.length).to.equal(1);
    expect(results[0].userId).to.equal(user1.id);
    expect(results[0].eventCount).to.equal(2);
  });

  it('should not include attempts in payment counts', async () => {
    await createUserCollectionAttempts(
      createDates([-10, -30]),
      AdvanceCollectionTrigger.USER_ONE_TIME_CARD,
      true,
    );
    const user1 = await createUserCollectionAttempts(
      createDates([-5, -10, -30]),
      AdvanceCollectionTrigger.USER_ONE_TIME_CARD,
    );

    const results = await OneTimePayment.queryOneTimePaymentCount(2, 30, moment());

    expect(results.length).to.equal(1);
    expect(results[0].userId).to.equal(user1.id);
    expect(results[0].eventCount).to.equal(3);
  });
});
