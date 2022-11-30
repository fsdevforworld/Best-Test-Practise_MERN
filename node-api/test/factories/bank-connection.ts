import * as Faker from 'faker';
import { moment } from '@dave-inc/time-lib';
import { BankConnection } from '../../src/models';
import { BankingDataSource } from '@dave-inc/wire-typings';

export default function(factory: any) {
  // SQL defaults bankingDataSource to 'PLAID'
  factory.define('bank-connection', BankConnection, {
    userId: factory.assoc('subscribed-user', 'id'),
    primaryBankAccountId: null,
    institutionId: factory.assoc('institution', 'id'),
    authToken: () => Faker.random.alphaNumeric(16),
    externalId: () => Faker.random.uuid(),
    initialPull: () => moment().format('YYYY-MM-DD'),
    historicalPull: () => moment().format('YYYY-MM-DD'),
  });

  factory.extend('bank-connection', 'bank-of-dave-bank-connection', {
    bankingDataSource: BankingDataSource.BankOfDave,
  });

  factory.extend('bank-connection', 'mx-bank-connection', {
    bankingDataSource: BankingDataSource.Mx,
  });

  factory.extend('bank-connection', 'plaid-bank-connection', {
    bankingDataSource: BankingDataSource.Plaid,
  });
}
