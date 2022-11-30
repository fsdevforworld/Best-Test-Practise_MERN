import { Moment, MOMENT_FORMATS } from '@dave-inc/time-lib';

export function createSubscriptionBillingUpsertData(
  userId: number,
  month: Moment,
): {
  userId: number;
  start: string;
  end: string;
  amount: number;
  billingCycle: string;
} {
  return {
    userId,
    start: month.startOf('month').format(MOMENT_FORMATS.DATETIME),
    end: month.endOf('month').format(MOMENT_FORMATS.DATETIME),
    amount: 0.0,
    billingCycle: month.format(MOMENT_FORMATS.YEAR_MONTH),
  };
}
