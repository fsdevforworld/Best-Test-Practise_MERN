import { IDashboardApiResourceRequest, IDashboardV2Response } from '../../../../../typings';
import { BankAccount } from '../../../../../models';
import { bankAccountSerializers, serializeMany } from '../../../serializers';
import getClient from '../../../../../domain/bank-of-dave-internal-api';
import { isNil } from 'lodash';
import { getMonthlyStatements as getMonthlyStatementsRequest } from '../../../domain/banking';

export const BankingInternalApiClient = getClient(); // Exported for tests

async function getMonthlyStatements(
  req: IDashboardApiResourceRequest<BankAccount>,
  res: IDashboardV2Response<bankAccountSerializers.IMonthlyStatementResource[]>,
) {
  const {
    resource: { id: bankAccountId, externalId: accountId },
  } = req;

  const statements = await getMonthlyStatementsRequest(BankingInternalApiClient, `${accountId}`);

  const data = await serializeMany(
    statements.filter(s => !isNil(s.id)), // If the statement doesn't exist or is empty, banking responds with null id
    bankAccountSerializers.serializeMonthlyStatement,
    { bankAccount: { type: 'bank-account', id: `${bankAccountId}` } },
  );

  res.send({
    data,
  });
}

export default getMonthlyStatements;
