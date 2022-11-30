import { BankingDataSource } from '@dave-inc/wire-typings';
import BankOfDaveInternalApiIntegration from '../../../src/domain/banking-data-source/bank-of-dave-internal/integration';
import MxIntegration from '../../../src/domain/banking-data-source/mx/integration';
import PlaidIntegration from '../../../src/domain/banking-data-source/plaid/integration';
import logger from '../../lib/logger';
import { BankConnection } from '../../models';
import { BankingDataSourceIntegration as IBankingDataSource } from './integration-interface';

function getBankOfDaveIntegration(daveUserId: number, daveUserUuid: string) {
  return new BankOfDaveInternalApiIntegration(daveUserId, daveUserUuid);
}

export async function generateBankingDataSource(
  connection: BankConnection,
): Promise<IBankingDataSource> {
  switch (connection.bankingDataSource) {
    case BankingDataSource.Plaid:
      return new PlaidIntegration(connection.authToken);
    case BankingDataSource.BankOfDave:
      return getBankOfDaveIntegration(connection.userId, connection.authToken);
    case BankingDataSource.Mx:
      const user = connection.user || (await connection.getUser());
      return new MxIntegration(user.mxUserId, connection.externalId);
    default:
      logger.error('Cannot generate unsupported banking data source', {
        bankingDataSource: connection.bankingDataSource,
      });
  }
}

export { getBankOfDaveIntegration, MxIntegration, PlaidIntegration };
