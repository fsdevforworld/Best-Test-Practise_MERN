import * as Bluebird from 'bluebird';
import { PaymentError } from '../../../lib/error';

import * as Collection from '../../../domain/collection';
import { Advance, BankAccount, BankConnection } from '../../../models';

import {
  collect,
  getCollectibleAdvances,
  getCollectibleAdvancesScheduled,
  handleSuccess,
  handleTaskSuccess,
  handleFailure,
  shouldAttemptCollection,
  shouldSkipTivan,
} from './helpers';
import { CollectionFailures } from '../../../domain/collection/enums';
import {
  createAdvanceRepaymentTask,
  shouldCollectWithTivan,
  AdHocBankAccountUpdate,
} from '../../../domain/repayment';
import { AdvanceCollectionTrigger } from '../../../typings';
import { dogstatsd } from '../../../lib/datadog-statsd';
import { TIVAN_AD_HOC_BA_UPDATE } from '../../../domain/repayment/experiment';

const COLLECT_JOB = 'COLLECT_AFTER_BANK_ACCOUNT_UPDATE';
const COLLECT_SCHEDULED_JOB = 'COLLECT_AFTER_BANK_ACCOUNT_UPDATE_SCHEDULED';

type CollectData = {
  bankAccountId: number;
  updatedAt: string;
};
async function runCollection(
  collectData: CollectData,
  retrieveFullOutstanding: boolean = false,
  getAdvanceFn: (userId: number, bankAccountId: number) => Promise<Advance[]>,
  jobName: string,
): Promise<void> {
  let bankAccount: BankAccount;
  let advance: Advance;
  const { bankAccountId, updatedAt } = collectData;

  try {
    bankAccount = await BankAccount.findByPk(bankAccountId, { include: [BankConnection] });
    const balances = { available: bankAccount.available, current: bankAccount.current };

    if (!(await shouldAttemptCollection(bankAccount, updatedAt))) {
      return;
    }

    const allAdvances = await getAdvanceFn(bankAccount.userId, bankAccountId);

    const advances = await Bluebird.filter(allAdvances, shouldSkipTivan);

    if (advances.length > 0) {
      advance = advances[0];

      const retrievalAmount = Collection.getRetrievalAmount(advance, balances, {
        retrieveFullOutstanding,
      });

      if (retrievalAmount > 0) {
        if (await shouldBankAccountUpdateCollectWithTivan(advance, bankAccountId)) {
          const taskId = await createAdvanceRepaymentTask(
            advance,
            AdvanceCollectionTrigger.BANK_ACCOUNT_UPDATE,
          );
          await handleTaskSuccess(taskId, advance, balances, jobName);
        } else {
          const payment = await collect(advance, retrievalAmount, bankAccountId);
          await handleSuccess(payment, advance, bankAccountId, balances, jobName);
        }
      } else {
        throw new PaymentError(CollectionFailures.BalanceTooLow, {
          data: { balances },
        });
      }
    }
  } catch (ex) {
    const userId = bankAccount ? bankAccount.userId : -1;
    await handleFailure(ex, bankAccountId, userId, jobName, advance);
  }
}

async function shouldBankAccountUpdateCollectWithTivan(
  advance: Advance,
  bankAccountId: number,
): Promise<boolean> {
  // Tivan can only collect from primary bank accounts
  if (bankAccountId !== advance.bankAccountId) {
    dogstatsd.increment('advance_collection.cannot_collect_tivan', {
      reason: 'non-primary-account',
    });
    return false;
  }
  return await shouldCollectWithTivan(
    advance,
    AdvanceCollectionTrigger.BANK_ACCOUNT_UPDATE,
    AdHocBankAccountUpdate,
    TIVAN_AD_HOC_BA_UPDATE,
  );
}

export async function collectAfterBankAccountUpdate(collectData: CollectData): Promise<void> {
  return runCollection(collectData, false, getCollectibleAdvances, COLLECT_JOB);
}

export async function collectAfterBankAccountUpdateScheduled(
  collectData: CollectData,
): Promise<void> {
  return runCollection(collectData, true, getCollectibleAdvancesScheduled, COLLECT_SCHEDULED_JOB);
}
