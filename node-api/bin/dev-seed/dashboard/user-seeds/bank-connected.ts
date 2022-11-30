import * as Faker from 'faker';
import { sample } from 'lodash';
import { BankAccountSubtype, BankingDataSource } from '@dave-inc/wire-typings';
import { BankAccount, BankConnection, User } from '../../../../src/models';
import { BankConnectionUpdate } from '../../../../src/models/warehouse';
import { syncUserDefaultBankAccount } from '../../../../src/domain/banking-data-sync';
import InstitutionHelper from '../../../../src/helper/institution';
import factory from '../../../../test/factories';
import { createUser } from '../../utils';
import { deleteDataForUser } from '../../delete-user';
import { connectToPlaid, runSeedAsScript } from '../utils';

const institutionIds = [
  'ins_13',
  'ins_14',
  'ins_127989',
  'ins_115640',
  'ins_19',
  'ins_3',
  'ins_15',
  'ins_4',
  'ins_35',
];

async function up() {
  const [user, institution] = await Promise.all([
    createUser({
      firstName: 'Bank Connected',
      lastName: 'Seed',
      email: Faker.internet.email(),
    }),
    InstitutionHelper.findOrCreatePlaidInstitution(sample(institutionIds)),
  ]);

  const bankConnection = await factory.create<BankConnection>('bank-connection', {
    userId: user.id,
    institutionId: institution.id,
    bankingDataSource: BankingDataSource.Plaid,
  });

  await connectToPlaid(bankConnection);

  await BankConnectionUpdate.create({
    userId: bankConnection.userId,
    bankConnectionId: bankConnection.id,
    type: 'BANK_CONNECTION_CREATED',
    extra: { bankingDataSource: bankConnection.bankingDataSource },
  });

  await bankConnection.reload({ include: [BankAccount] });

  const bankAccount = bankConnection.bankAccounts.find(account => {
    return account.subtype === BankAccountSubtype.Checking;
  });

  await syncUserDefaultBankAccount(bankAccount.id);

  const paymentMethod = await factory.create('payment-method', {
    bankAccountId: bankAccount.id,
    userId: user.id,
  });

  await bankAccount.update({ defaultPaymentMethodId: paymentMethod.id });
}

async function down() {
  const user = await User.findOne({
    where: {
      firstName: 'Bank Connected',
      lastName: 'Seed',
    },
  });

  if (user) {
    await deleteDataForUser(user);
  }
}

export { up, down };

if (require.main === module) {
  runSeedAsScript(up, down);
}
