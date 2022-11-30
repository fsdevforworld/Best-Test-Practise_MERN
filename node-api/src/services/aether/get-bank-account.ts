import { StandardResponse } from '@dave-inc/wire-typings';
import { Request, NextFunction } from 'express';
import { BankAccount } from '../../models';

import { NotFoundError, InvalidParametersError } from '../../lib/error';
import { IDaveResourceRequest, IDaveResponse } from '../../typings';

export async function getBankAccount(
  req: IDaveResourceRequest<BankAccount>,
  res: IDaveResponse<StandardResponse>,
) {
  const bankAccount = req.resource;

  const [isDaveBanking, isPrimary, connection] = await Promise.all([
    bankAccount.isDaveBanking(),
    bankAccount.isPrimaryAccount(),
    bankAccount.getBankConnection(),
  ]);

  const response = {
    ok: true,
    bankAccount: {
      id: bankAccount.id,
      isDaveBanking,
      isPrimary,
      isSupported: bankAccount.isSupported(),
      connectionHasValidCredentials: connection?.hasValidCredentials,
      balances: {
        available: bankAccount.available,
        current: bankAccount.current,
      },
    },
  };

  return res.send(response);
}

export async function getBankAccountByUserAndExternalId(
  req: Request,
  res: IDaveResponse<StandardResponse>,
  next: NextFunction,
) {
  const { userId, externalId } = req.params;

  if (!userId || !externalId) {
    return next(new InvalidParametersError('Could not find resource at specified path'));
  }

  const bankAccount = await BankAccount.getAccountByUserIdAndExternalId(userId, externalId);

  if (!bankAccount) {
    return next(new NotFoundError());
  }

  const [isDaveBanking, isPrimary, connection] = await Promise.all([
    bankAccount.isDaveBanking(),
    bankAccount.isPrimaryAccount(),
    bankAccount.getBankConnection(),
  ]);

  const response = {
    ok: true,
    bankAccount: {
      id: bankAccount.id,
      isDaveBanking,
      isPrimary,
      isSupported: bankAccount.isSupported(),
      connectionHasValidCredentials: connection?.hasValidCredentials,
      balances: {
        available: bankAccount.available,
        current: bankAccount.current,
      },
    },
  };

  return res.send(response);
}
