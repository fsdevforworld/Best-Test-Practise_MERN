import { Response } from 'express';
import { InvalidParametersError } from '../../../lib/error';
import { IDashboardApiRequest } from '../../../typings';
import { getParams } from '../../../lib/utils';
import { searchExternalTransactions } from '../../../domain/fetch-external-transaction';

async function search(req: IDashboardApiRequest, res: Response): Promise<Response> {
  const { transactionType, externalId, referenceId } = getParams(
    req.query,
    ['transactionType'],
    ['externalId', 'referenceId'],
  );
  if (!externalId && !referenceId) {
    throw new InvalidParametersError('Must provide either an externalId or a referenceId');
  }

  const results = await searchExternalTransactions({
    externalId,
    referenceId,
    type: transactionType,
  });

  return res.send({ status: 'ok', results });
}

export default { search };
