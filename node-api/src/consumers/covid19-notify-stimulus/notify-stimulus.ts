import { Moment } from 'moment';
import * as Braze from '../../lib/braze';
import HeathClient from '../../lib/heath-client';
import { dogstatsd } from '../../lib/datadog-statsd';
import { moment } from '@dave-inc/time-lib';
import { AnalyticsEvent } from '../../typings';
import { BankTransaction } from '@dave-inc/heath-client';
import { BankAccount } from '../../models';

export async function getIrsDeposits(
  bankAccountIds: number[],
  startDate: Moment,
): Promise<BankTransaction[]> {
  return HeathClient.getBankTransactions(bankAccountIds, {
    transactionDate: { gte: startDate.ymd() },
    amount: { gte: 1200 },
    displayName: { like: '%irs%' },
  });
}

export function irsWordCheck(name: string): boolean {
  return /\birs\b/i.test(name);
}

// base amounts of $1200 for single, $2400 for
// married filing jointly, with an additional
// $500 for each child
export function isValidAmount(amount: number): boolean {
  return (
    (amount >= 1200 && (amount - 1200) % 500 === 0) ||
    (amount >= 2400 && (amount - 2400) % 500 === 0)
  );
}

async function sendNotification(
  userId: number,
  transactionDateStr: string,
  transactionName: string,
  amount: number,
  time: Moment = moment(),
): Promise<void> {
  await Braze.track({
    events: [
      {
        externalId: userId.toString(),
        name: AnalyticsEvent.Covid19Stimulus,
        properties: {
          userId,
          transactionDate: transactionDateStr,
          transactionName,
          amount,
        },
        time,
      },
    ],
  });
}

export async function notifyStimulus(bankAccountIds: number[]): Promise<void> {
  dogstatsd.increment('covid19_stimulus.process_update');

  // buffer a couple days before the actual date
  // of 2020-04-15
  const startDate = moment('2020-04-13');
  const transactions = await getIrsDeposits(bankAccountIds, startDate);

  const [stimulus] = transactions
    .filter(t => irsWordCheck(t.displayName))
    .filter(t => isValidAmount(t.amount));

  if (stimulus) {
    const bankAccount = await BankAccount.findByPk(stimulus.bankAccountId);
    if (bankAccount) {
      dogstatsd.increment('covid19_stimulus.notify_stimulus');
      await sendNotification(
        bankAccount.userId,
        stimulus.transactionDate,
        stimulus.displayName,
        stimulus.amount,
      );
    }
  }
}
