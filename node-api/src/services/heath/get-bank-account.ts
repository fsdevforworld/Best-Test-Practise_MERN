import { IDaveResourceRequest } from '../../typings';
import { BankAccount, BankConnection } from '../../models';
import { Request, Response } from 'express';
import { serializeBankAccount } from './serialize-bank-account';
import { BaseDaveApiError, InvalidParametersError } from '@dave-inc/error-types';
import * as Bluebird from 'bluebird';

export async function getBankAccount(req: IDaveResourceRequest<BankAccount>, res: Response) {
  const bankAccount = req.resource;

  const response = await serializeBankAccount(bankAccount);

  return res.send(response);
}

export async function getPrimaryBankAccounts(req: Request, res: Response) {
  const { userId } = req.params;
  if (!userId) {
    throw new InvalidParametersError('User Id is required');
  }
  const bankConnections = await BankConnection.findAll({ where: { userId } });

  const response = await Bluebird.map(bankConnections, async bc => {
    const bankAccount = await bc.getPrimaryBankAccount();
    if (bankAccount) {
      return serializeBankAccount(bankAccount, bc);
    }
  }).filter(ba => !!ba);

  if (response.length === 0) {
    throw new BaseDaveApiError('No accounts found for user', {
      statusCode: 404,
      name: 'NoBankAccountsFound',
    });
  }

  return res.send(response);
}
