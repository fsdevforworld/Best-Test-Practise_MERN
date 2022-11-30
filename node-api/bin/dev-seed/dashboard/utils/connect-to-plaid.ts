import { BalanceLogCaller, BankingDataSource } from '@dave-inc/wire-typings';
import { BankConnection } from '../../../../src/models';
import * as config from 'config';
import client from '../../../../src/lib/plaid';
import * as BankingDataSync from '../../../../src/domain/banking-data-sync';
import { PlaidIntegration } from '../../../../src/domain/banking-data-source';
import { poll } from '../../../../src/lib/utils';

async function connectToPlaid(bankConnection: BankConnection): Promise<void> {
  const [institution, user] = await Promise.all([
    bankConnection.institution || bankConnection.getInstitution(),
    bankConnection.user || bankConnection.getUser(),
  ]);

  const token = await client.sandboxPublicTokenCreate(
    institution.plaidInstitutionId,
    ['auth', 'transactions'],
    {
      webhook: config.get('plaid.webhookUrl'),
      override_username: 'user_custom',
      override_password: JSON.stringify({
        override_accounts: [
          {
            type: 'depository',
            subtype: 'checking',
          },
          {
            type: 'depository',
            subtype: 'savings',
          },
        ],
      }),
    },
  );

  const nexus = await new PlaidIntegration(token.public_token).createNexus();

  await bankConnection.update({
    externalId: nexus.externalId,
    authToken: nexus.authToken,
  });

  const bankAccounts = await BankingDataSync.createBankAccounts(bankConnection, user);

  await poll(() => client.getItem(nexus.authToken), {
    shouldKeepPolling: item => item.status.transactions.last_successful_update === null,
    delayMs: 5000,
    timeoutMs: 30000,
  });

  await Promise.all([
    BankingDataSync.fetchAndSyncBankTransactions(bankConnection, { initialPull: true }),
    // InitialPull isn't actually being set during fetchAndSyncBankTransactions (it's being set in the factory), want to sync lastPull to reflect this
    bankConnection.update({ lastPull: bankConnection.initialPull }),
  ]);

  await Promise.all(
    bankAccounts.map(bankAccount =>
      BankingDataSync.backfillDailyBalances(
        bankAccount,
        BalanceLogCaller.BinDevSeed,
        BankingDataSource.Plaid,
      ),
    ),
  );
}

export default connectToPlaid;
