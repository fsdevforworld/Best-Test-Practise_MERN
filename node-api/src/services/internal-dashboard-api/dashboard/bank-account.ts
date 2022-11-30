import * as Bluebird from 'bluebird';
import { moment } from '@dave-inc/time-lib';
import { ConflictError } from '../../../lib/error';
import { BankAccount } from '../../../models';
import { findMatchingDeletedAccounts } from '../../../helper/bank-account';
import * as BankingDataSync from '../../../domain/banking-data-sync';
import HeathClient from '../../../lib/heath-client';
import { IDashboardApiRequest } from '../../../typings';
import { Response } from 'express';
import { MicroDeposit } from '@dave-inc/wire-typings';

async function fetchAccountDetails(bankAccountId: number) {
  const today = moment().format('YYYY-MM-DD');
  const ninetyDaysAgo = moment()
    .subtract(90, 'days')
    .format('YYYY-MM-DD');

  const accountDetails = await Bluebird.props({
    transactions: HeathClient.getBatchedRecentBankTransactions(bankAccountId, ninetyDaysAgo),
    balances: BankingDataSync.getByDateRange(bankAccountId, ninetyDaysAgo, today),
  });

  return { ...accountDetails };
}

async function details(req: IDashboardApiRequest, res: Response): Promise<Response> {
  if (!req.params || !req.params.id) {
    return res.status(400).send({});
  }

  const bankAccountId = parseInt(req.params.id, 10);
  const AccountDetails = await fetchAccountDetails(bankAccountId);
  return res.status(200).send(AccountDetails);
}

async function forceMicroDepositComplete(
  req: IDashboardApiRequest,
  res: Response,
): Promise<Response> {
  const bankAccount = await BankAccount.findByPk(req.params.id);
  const matchingDeletedAccounts = await findMatchingDeletedAccounts(bankAccount);
  const previousMicroDeposit = matchingDeletedAccounts.find(
    ba => ba.microDeposit === MicroDeposit.COMPLETED,
  );
  // Check if this user already completed micro deposit for this account number
  // And if so, force it complete so this node does not return an error
  if (previousMicroDeposit) {
    await bankAccount.forceMicroDepositComplete();
    return res.send({
      message: 'Forced micro deposit complete for this account.',
      success: true,
    });
  } else {
    throw new ConflictError(
      'This account does not have a matching deleted account that passed micro deposit.',
    );
  }
}

export default {
  details,
  forceMicroDepositComplete,
};
