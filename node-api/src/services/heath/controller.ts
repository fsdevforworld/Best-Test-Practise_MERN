import { Request, Response } from 'express';
import { isArray, isInteger } from 'lodash';
import { InvalidParametersError } from '../../lib/error';
import * as BankingData from './domain';
import { getParams } from '../../lib/utils';
import { BankTransactionCreate } from '@dave-inc/heath-client';
import { sequelize } from '../../models';
import { QueryTypes } from 'sequelize';
import { Moment, moment } from '@dave-inc/time-lib';

export async function queryBankTransactions(req: Request, res: Response) {
  const { bankAccountId, filter, options } = req.body;
  if (!bankAccountId) {
    throw new InvalidParametersError('bankAccountId is required.');
  } else if (
    !(isArray(bankAccountId) && bankAccountId.every(id => isInteger(id))) &&
    !isInteger(bankAccountId)
  ) {
    throw new InvalidParametersError('bankAccountId must be an array of integers or an integer.');
  }

  const transactions = await BankingData.getBankTransactions(bankAccountId, filter, options);

  res.send(transactions);
}

export async function countTransactions(req: Request, res: Response) {
  const { bankAccountId, useReadReplica = false } = req.query;
  const parsed = parseInt(bankAccountId, 10);
  if (isNaN(parsed)) {
    throw new InvalidParametersError('bankAccountId must be a valid integer.');
  }
  const count = await BankingData.countBankTransactions(parsed, { useReadReplica });

  res.send({ count });
}

export async function getReplicaLag(req: Request, res: Response) {
  const [time] = await sequelize.query<{ created: Moment }>(
    'SELECT created FROM bank_transaction ORDER BY id DESC LIMIT 1',
    {
      type: QueryTypes.SELECT,
      useMaster: false,
    },
  );

  res.send({
    replicationTime: time.created,
    replicationLagSeconds: moment().diff(time.created, 'seconds'),
  });
}

export async function createBankTransactions(req: Request, res: Response) {
  const { bankTransactions } = req.body;
  const validated = bankTransactions.map((trans: BankTransactionCreate) => {
    return getParams(
      trans,
      [
        'bankAccountId',
        'userId',
        'externalId',
        'externalName',
        'amount',
        'transactionDate',
        'pending',
      ],
      [
        'pendingExternalName',
        'pendingDisplayName',
        'merchantInfoId',
        'plaidCategory',
        'address',
        'city',
        'state',
        'zipCode',
        'displayName',
        'plaidCategoryId',
      ],
    );
  });

  const transactions = await BankingData.createBankTransactions(validated);

  res.send(transactions);
}
