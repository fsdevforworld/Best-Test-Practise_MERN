import { moment } from '@dave-inc/time-lib';
import { BankAccount, Institution } from '../../../models';
import { IDashboardApiRequest } from '../../../typings';
import { Response } from 'express';
import * as Bluebird from 'bluebird';
import { flatten } from 'lodash';
import HeathClient from '../../../lib/heath-client';

async function getSixtyDaysAgo(req: IDashboardApiRequest, res: Response): Promise<Response> {
  const userId = req.params.userId;
  const sixtyDaysAgo = moment()
    .subtract(60, 'days')
    .format('YYYY-MM-DD');

  const bankAccounts = await BankAccount.findAll({
    where: { userId },
    include: [Institution],
  });

  const formattedTransactions = await Bluebird.map(bankAccounts, async bankAccount => {
    const bankData = {
      bankAccountId: bankAccount.id,
      bankAccountDisplayName: bankAccount.displayName,
      institutionDisplayName: bankAccount.institution.displayName,
      lastFour: bankAccount.lastFour,
      primaryColor: bankAccount.institution.primaryColor,
    };
    const transactions = await HeathClient.getBatchedRecentBankTransactions(
      bankAccount.id,
      sixtyDaysAgo,
    );
    transactions.forEach(transaction => ((transaction as any).bankData = bankData));

    return transactions;
  });

  return res.send(flatten(formattedTransactions));
}

export default { getSixtyDaysAgo };
