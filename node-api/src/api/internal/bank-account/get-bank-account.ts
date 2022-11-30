import { MicroDeposit } from '@dave-inc/wire-typings';
import { Request, Response } from 'express';
import * as BankingDataSync from '../../../domain/banking-data-sync';
import { dogstatsd } from '../../../lib/datadog-statsd';
import { BaseApiError, NotFoundError } from '../../../lib/error';
import gcloudKms from '../../../lib/gcloud-kms';
import { BankAccount } from '../../../models';
import { BalanceCheckTrigger, BalanceLogCaller } from '../../../typings';

async function getRoutingAndAccountNumbers(
  bankAccount: BankAccount,
): Promise<{ routingNumber: string; accountNumber: string }> {
  if (bankAccount.accountNumberAes256) {
    const decrypted = await gcloudKms.decrypt(bankAccount.accountNumberAes256);
    const accountNumber = decrypted.split('|')[0];
    const routingNumber = decrypted.split('|')[1];
    return { accountNumber, routingNumber };
  } else {
    dogstatsd.increment('internal.get_bank_account.account_number_fetch_fail');
    throw new BaseApiError('Bank account not available for account and routing', {
      statusCode: 400,
    });
  }
}

async function getBalances(bankAccount: BankAccount) {
  try {
    const balances = await BankingDataSync.refreshBalance(bankAccount, {
      reason: BalanceCheckTrigger.USER_REFRESH,
      caller: BalanceLogCaller.DaveBankingBankAccountFetch,
      useCache: false,
    });
    dogstatsd.increment('internal.get_bank_account.success');
    return balances;
  } catch (ex) {
    dogstatsd.increment('internal.get_bank_account.balance_fetch_from_source_fail');
  }

  try {
    // Fetch balance from cache if fails
    const balances = await BankingDataSync.refreshBalance(bankAccount, {
      reason: BalanceCheckTrigger.USER_REFRESH,
      caller: BalanceLogCaller.DaveBankingBankAccountFetch,
      useCache: true,
    });
    dogstatsd.increment('internal.get_bank_account.success');
    return balances;
  } catch (err) {
    dogstatsd.increment('internal.get_bank_account.balance_fetch_from_cache_fail');
    const bankConnection = await bankAccount.getBankConnection();
    await BankingDataSync.handleBankingDataSourceError(err, bankConnection);
  }
}

function microDepositCheck(bankAccount: BankAccount): void {
  if (
    bankAccount.microDeposit &&
    bankAccount.microDeposit !== MicroDeposit.COMPLETED &&
    bankAccount.microDeposit !== MicroDeposit.NOT_REQUIRED
  ) {
    dogstatsd.increment('internal.get_bank_account.micro_deposit_check_fail');
    throw new BaseApiError('Bank account not yet passed micro-deposit check', { statusCode: 400 });
  }
}

export async function getBankAccount(req: Request, res: Response) {
  const daveUserId = parseInt(req.params.id, 10);
  const bankAccountId = req.params.bankAccountId;

  const bankAccount = await BankAccount.findByPk(bankAccountId);

  if (bankAccount.userId !== daveUserId) {
    throw new NotFoundError();
  }

  microDepositCheck(bankAccount);

  const { accountNumber, routingNumber } = await getRoutingAndAccountNumbers(bankAccount);

  let balances;
  if (req.query.skipBalanceFetch?.toLowerCase() !== 'true') {
    const { current, available } = await getBalances(bankAccount);
    balances = { currentBalance: current, availableBalance: available };
  }

  res.send({
    bankAccountId,
    accountNumber,
    routingNumber,
    displayName: bankAccount.displayName,
    subtype: bankAccount.subtype,
    isDaveBanking: await bankAccount.isDaveBanking(),
    ...balances,
  });
}
