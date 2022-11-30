import * as openapi from '@dave-inc/banking-internal-api-client';
import logger from '../../../../lib/logger';
import { IApiBankAccountMonthlyStatement } from '@dave-inc/banking-internal-api-client';

async function getMonthlyStatements(
  client: openapi.V1Api,
  bankAccountId: string,
): Promise<IApiBankAccountMonthlyStatement[]> {
  let monthlyStatements: IApiBankAccountMonthlyStatement[];

  try {
    const { data } = await client.getBankAccountMonthlyStatements(bankAccountId);
    monthlyStatements = data.statements;
  } catch (err) {
    if (err?.response?.status === 404) {
      logger.warn(`Get monthly statements: bank account ${bankAccountId} not found`);
      monthlyStatements = [];
    } else {
      throw err;
    }
  }

  return monthlyStatements;
}

export default getMonthlyStatements;
