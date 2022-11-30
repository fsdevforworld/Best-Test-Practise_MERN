import { Request, Response } from 'express';
import { isNil } from 'lodash';
import { NotFoundError, InvalidParametersError } from '@dave-inc/error-types';
import { BankAccount } from '../../models';
import { bankAccountModelToPaymentMethod } from '../../typings';

export default async function getBankAccountDetails(req: Request, res: Response) {
  const { id } = req.params;
  const { externalId } = req.query;
  if (isNil(id) && isNil(externalId)) {
    throw new InvalidParametersError(
      'Must provide either id or externalId to retrieve bank account',
    );
  }

  let bankAccount: BankAccount;

  if (id) {
    const parsedId = parseInt(id, 10);
    if (isNaN(parsedId)) {
      throw new InvalidParametersError(`Invalid bank account ID ${id}`);
    }

    bankAccount = await BankAccount.findByPk(parsedId);
  } else if (externalId) {
    bankAccount = await BankAccount.getAccountByExternalId(externalId);
  }

  if (isNil(bankAccount)) {
    throw new NotFoundError();
  }

  const response = await bankAccountModelToPaymentMethod(bankAccount);
  res.json(response);
}
