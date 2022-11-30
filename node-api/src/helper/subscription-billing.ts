import {
  PaymentMethod,
  RewardsLedger,
  SubscriptionBilling,
  SubscriptionPayment,
  BankAccount,
  Institution,
} from '../models';
import { AnalyticsEvent } from '../typings';
import { getNextWeekday, moment, Moment } from '@dave-inc/time-lib';
import { dogstatsd } from '../lib/datadog-statsd';

import amplitude from '../lib/amplitude';
import braze from '../lib/braze';
import * as _ from 'lodash';
import { Op, Transaction } from 'sequelize';
import { getBankAccountToCharge } from '../domain/collection';
import { FreeMonthSourceField, FreeMonthSourceName } from '../typings/enums';

export const FIRST_MONTH_FREE_CODE = 'firstmonthfree';

export async function setDueDate(billing: SubscriptionBilling): Promise<void> {
  let dueDate: Moment = await firstPaycheckDuringBilling(billing);

  if (!dueDate) {
    dueDate = getNextWeekday(billing.start, 'Friday', true);
  }

  if (dueDate.isAfter(billing.end)) {
    dueDate = billing.end.clone();
  }

  await billing.update({ dueDate });
}

async function firstPaycheckDuringBilling(billing: SubscriptionBilling) {
  const bankAccount = await getBankAccountToCharge(billing);

  if (!bankAccount) {
    return null;
  }

  const paycheck = await bankAccount.getMainPaycheckRecurringTransaction();

  if (!paycheck) {
    return null;
  }

  const [nextPaycheck] = paycheck.rsched.between(billing.start, billing.end, true);

  return nextPaycheck;
}

export function calculateAmount(date: Moment, promotionCode: string = null) {
  let amount;
  if (promotionCode && promotionCode === FIRST_MONTH_FREE_CODE) {
    dogstatsd.increment('subscription_billing.free_month', {
      source: 'first_month_free_redeemed',
    });
    amount = 0;
  } else {
    // if there are less than 10 days left in the month,
    // Dave will cover the cost of the subscription
    const end = moment(date).endOf('month');

    if (end.diff(date, 'days') < 10) {
      dogstatsd.increment('subscription_billing.free_month', {
        source: 'paid_by_dave',
      });

      amount = 0;
    } else {
      amount = 1;
    }
  }
  return amount;
}

export async function trackFreeMonth(
  userId: number,
  month: string,
  source: string,
  sourceType: string,
) {
  const properties = { source, month, sourceType };

  const brazeTrackEvent = braze.track({
    events: [
      {
        name: AnalyticsEvent.FreeMonthEarned,
        externalId: `${userId}`,
        properties,
        time: moment(),
      },
    ],
  });

  const amplitudeTrackEvent = amplitude.track({
    userId,
    eventType: AnalyticsEvent.FreeMonthEarned,
    eventProperties: properties,
  });

  dogstatsd.increment('subscription_billing.free_month', { source: sourceType });
  return Promise.all([brazeTrackEvent, amplitudeTrackEvent]);
}

async function coverUnpaidMonths(
  userId: number,
  freeMonths: number,
  transaction: Transaction,
  sourceName: FreeMonthSourceName,
  sourceField: FreeMonthSourceField,
  sourceId: number,
): Promise<number> {
  let freeMonthsRemaining = freeMonths;
  const unpaidBillings = await SubscriptionBilling.scope('unpaid').findAll({
    where: {
      userId,
    },
    order: ['billingCycle'],
    transaction,
  });

  if (!_.isEmpty(unpaidBillings)) {
    const unpaidIdsToUpdate = _.reduce(
      unpaidBillings,
      (accum, unpaid) => {
        if (freeMonthsRemaining) {
          accum.push(unpaid.id);
          freeMonthsRemaining -= 1;
          const month = unpaid.start.format('MMMM');
          trackFreeMonth(userId, month, sourceName, sourceName);
        }
        return accum;
      },
      [],
    );

    await SubscriptionBilling.update(
      {
        amount: 0,
        [sourceField]: sourceId,
      },
      {
        where: {
          id: {
            [Op.in]: unpaidIdsToUpdate,
          },
        },
        transaction,
      },
    );
  }

  return freeMonthsRemaining;
}

export async function addAttributedFreeMonths(
  userId: number,
  freeMonths: number,
  transaction: Transaction,
  sourceName: FreeMonthSourceName,
  sourceField: FreeMonthSourceField,
  sourceId: number,
) {
  const freeMonthsRemaining = await coverUnpaidMonths(
    userId,
    freeMonths,
    transaction,
    sourceName,
    sourceField,
    sourceId,
  );

  if (freeMonthsRemaining) {
    // Get latest billed month
    const freeMonthsBilling = [];
    const nextMonthBilling = await SubscriptionBilling.findOne({
      where: {
        userId,
      },
      order: [['billingCycle', 'DESC']],
      transaction,
    });

    const nextMonth = nextMonthBilling.start.add(1, 'months');

    for (let i = 1; i <= freeMonthsRemaining; i++) {
      freeMonthsBilling.push({
        userId,
        start: nextMonth.startOf('month').format('YYYY-MM-DD HH:mm:ss'),
        end: nextMonth.endOf('month').format('YYYY-MM-DD HH:mm:ss'),
        amount: 0.0,
        billingCycle: nextMonth.format('YYYY-MM'),
        [sourceField]: sourceId,
      });

      trackFreeMonth(userId, nextMonth.format('MMMM'), sourceName, sourceName);
      nextMonth.add(1, 'months');
    }

    await SubscriptionBilling.bulkCreate(freeMonthsBilling, {
      transaction,
    });
  }
}

export async function getSubscriptionBillings(userId: number) {
  const subscriptionBillings = await SubscriptionBilling.findAll({
    include: [
      {
        model: SubscriptionPayment,
        required: false,
        include: [
          {
            model: PaymentMethod,
            required: false,
          },
          {
            model: BankAccount,
            required: false,
            include: [
              {
                model: Institution,
                required: true,
              },
            ],
          },
        ],
      },
      {
        model: RewardsLedger,
        required: false,
      },
    ],
    order: [
      ['billing_cycle', 'DESC'],
      [{ model: SubscriptionPayment, as: 'subscriptionPayments' }, 'created', 'ASC'],
    ],
    where: { userId },
  });

  return subscriptionBillings.map(subscriptionBilling => subscriptionBilling.serialize());
}
