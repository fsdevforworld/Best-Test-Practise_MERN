import { BankAccountComplexResponse } from '@dave-inc/wire-typings';
import { Request, Response } from 'express';
import { createDaveBankingConnection } from '../../domain/banking-data-sync';
import { getParams } from '../../lib/utils';
import { serializeBankAccount } from '../../serialization';
import { IDaveResponse } from '../../typings';

export async function create(
  req: Request,
  res: IDaveResponse<BankAccountComplexResponse>,
): Promise<Response> {
  const {
    daveUserId,
    bankAccountId,
    lastFour,
    displayName,
    currentBalance,
    availableBalance,
    type,
    subtype,
    ipAddress,
    appsflyerDeviceId,
    platform,
  } = getParams(
    req.body,
    [
      'daveUserId',
      'bankAccountId',
      'lastFour',
      'displayName',
      'currentBalance',
      'availableBalance',
      'type',
      'subtype',
      'ipAddress',
    ],
    ['appsflyerDeviceId', 'platform'],
  );

  const daveBankAccount = await createDaveBankingConnection({
    daveUserId,
    bankAccountId,
    lastFour,
    displayName,
    currentBalance,
    availableBalance,
    type,
    subtype,
    ipAddress,
    appsflyerDeviceId,
    platform,
  });

  return res.send(await serializeBankAccount(daveBankAccount));
}
