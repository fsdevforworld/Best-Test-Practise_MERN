import { Request, Response } from 'express';
import { InvalidParametersError } from '../../lib/error';
import * as DevSeed from '../../../bin/dev-seed';
import { BankAccount, User } from '../../models';
import BankingDataClient from '../../lib/heath-client';
import { BaseApiError, NotFoundError } from '../../lib/error';
import { BankingDataSource } from '@dave-inc/wire-typings';
import { BalanceLogCaller } from '../../typings';
import { moment } from '@dave-inc/time-lib';
import * as BankingDataSync from '../../domain/banking-data-sync';

export async function seedUsers(req: Request, res: Response) {
  const { direction, phoneNumSeed } = req.body;

  if (!direction || !phoneNumSeed) {
    throw new InvalidParametersError('must provide a direction and a phoneNumSeed');
  }

  if (direction !== 'up' && direction !== 'down') {
    throw new InvalidParametersError('direction must be up or down');
  }

  if (typeof phoneNumSeed !== 'number') {
    throw new InvalidParametersError('phoneNumSeed must be a number');
  }

  await DevSeed.runAllSeeds(direction, phoneNumSeed);
  return res.json({ success: true });
}

export async function patchUser(req: Request, res: Response): Promise<Response> {
  if (req.body.allowDuplicateCard) {
    await User.update(
      { allowDuplicateCard: req.body.allowDuplicateCard },
      { where: { id: req.params.id } },
    );
  }

  return res.send({ ok: true });
}

/**
 * This is used to set the balance log up to be able to apply for an advance
 */
export async function postBalanceLogs(req: Request, res: Response): Promise<Response> {
  const { amount, date, bankingDataSource, bankAccountExternalId } = req.body;

  // Find the first bank account for the user
  const bankAccount = await BankAccount.findOne({
    where: {
      externalId: bankAccountExternalId,
    },
  });

  if (!bankAccount) {
    throw new NotFoundError('No bank account found by external id');
  }

  if (!Object.values(BankingDataSource).includes(bankingDataSource)) {
    throw new BaseApiError(`Unrecognized banking data source`, {
      statusCode: 400,
      data: { bankingDataSource },
    });
  }

  await BankingDataSync.backfillDailyBalances(
    bankAccount,
    BalanceLogCaller.BinDevSeed,
    bankingDataSource,
  );

  await BankingDataClient.saveBalanceLogs({
    userId: bankAccount.userId,
    bankAccountId: bankAccount.id,
    bankConnectionId: bankAccount.bankConnectionId,
    processorAccountId: bankAccount.externalId,
    processorName: bankingDataSource as BankingDataSource,
    current: amount,
    available: amount,
    date: moment(date).format(),
    caller: BalanceLogCaller.BinDevSeed,
  });

  return res.send({ ok: true });
}
