import { DonationOrganizationCode, ExternalTransactionProcessor } from '@dave-inc/wire-typings';

import { User } from '../../../../src/models';
import { createUser } from '../../utils';
import factory from '../../../../test/factories';
import { deleteDataForUser } from '../../delete-user';
import { getEmail } from '../utils';

const email = 'pending-advance-disbursement@dave.com';

async function up(phoneNumberSeed: string) {
  const user = await createUser({
    firstName: 'Pending Advance Disbursement',
    lastName: 'Seed',
    email: getEmail(phoneNumberSeed, email),
  });

  const bankConnection = await factory.create('bank-connection', {
    userId: user.id,
    hasValidCredentials: true,
    hasTransactions: true,
  });

  const bankAccount = await factory.create('checking-account', {
    userId: user.id,
    institutionId: bankConnection.institutionId,
    bankConnectionId: bankConnection.id,
  });

  await user.update({ defaultBankAccountId: bankAccount.id });

  const advance = await factory.create('advance', {
    bankAccountId: bankAccount.id,
    disbursementProcessor: ExternalTransactionProcessor.Synapsepay,
    userId: user.id,
    disbursementStatus: 'PENDING',
  });

  await factory.create('advance-tip', {
    advanceId: advance.id,
    donationOrganization: DonationOrganizationCode.TREES,
  });
}

async function down(phoneNumberSeed: string) {
  const user = await User.findOne({
    where: {
      email: getEmail(phoneNumberSeed, email),
    },
  });

  if (user) {
    await deleteDataForUser(user);
  }
}

export { up, down };
