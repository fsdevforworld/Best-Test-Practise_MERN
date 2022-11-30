import { BankAccountSubtype, BankAccountType, BankingDataSource } from '@dave-inc/wire-typings';
import { AppsFlyerEvents, logAppsflyerEvent } from '../../lib/appsflyer';
import { dogstatsd } from '../../lib/datadog-statsd';
import { NotFoundError } from '../../lib/error';
import { moment } from '@dave-inc/time-lib';
import {
  BankAccount,
  BankConnection,
  BankConnectionTransition,
  Institution,
  sequelize,
  User,
} from '../../models';
import { BankConnectionUpdate } from '../../models/warehouse';
import { BankConnectionUpdateType, Platforms } from '../../typings';

export async function createDaveBankingConnection({
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
}: {
  daveUserId: number;
  bankAccountId: string;
  lastFour: string;
  displayName: string;
  currentBalance: number;
  availableBalance: number;
  type: BankAccountType;
  subtype: BankAccountSubtype;
  ipAddress: string;
  appsflyerDeviceId: string;
  platform: Platforms;
}) {
  const institution = await Institution.findOne({
    where: { plaidInstitutionId: BankingDataSource.BankOfDave },
  });

  if (!institution) {
    throw new NotFoundError(`Could not find institution with id: ${BankingDataSource.BankOfDave}`);
  }

  const daveUser = await User.findByPk(daveUserId);
  if (!daveUser) {
    throw new NotFoundError(`User ${daveUserId} not found`);
  }

  const [bankConnection, isNewBankConnection] = await BankConnection.findOrCreate({
    where: {
      userId: daveUserId,
      bankingDataSource: BankingDataSource.BankOfDave,
    },
    defaults: {
      authToken: daveUserId,
      externalId: daveUserId,
      userId: daveUserId,
      institutionId: institution.id,
      bankingDataSource: BankingDataSource.BankOfDave,
      initialPull: moment(),
      lastPull: moment(),
    },
  });

  if (isNewBankConnection) {
    await BankConnectionUpdate.create({
      userId: bankConnection.userId,
      bankConnectionId: bankConnection.id,
      type: BankConnectionUpdateType.CREATED,
      extra: { bankingDataSource: bankConnection.bankingDataSource },
    });
  }

  const [daveBankAccount, isNewAccount] = await BankAccount.findOrCreate({
    where: {
      userId: daveUserId,
      externalId: bankAccountId,
    },
    defaults: {
      bankConnectionId: bankConnection.id,
      userId: daveUserId,
      institutionId: institution.id,
      externalId: bankAccountId,
      lastFour,
      displayName,
      current: currentBalance,
      available: availableBalance,
      type,
      subtype,
    },
  });

  if (isNewAccount) {
    await daveBankAccount.forceMicroDepositComplete();
    if (subtype === BankAccountSubtype.Checking) {
      await finalizeDaveSpendingAccount({
        daveBankAccount,
        daveUser,
        bankConnection,
        ipAddress,
        appsflyerDeviceId,
        platform,
      });
    }
  } else {
    dogstatsd.increment('createDaveBankingConnection.creating_bank_account', {
      error: 'uniqueness',
    });
  }

  return daveBankAccount;
}

async function finalizeDaveSpendingAccount({
  daveBankAccount,
  daveUser,
  bankConnection,
  ipAddress,
  appsflyerDeviceId,
  platform,
}: {
  daveBankAccount: BankAccount;
  daveUser: User;
  bankConnection: BankConnection;
  ipAddress: string;
  appsflyerDeviceId: string;
  platform: Platforms;
}) {
  if (daveUser.defaultBankAccountId) {
    await BankConnectionTransition.findOrCreateFromToBankConnection(
      daveUser.defaultBankAccountId,
      bankConnection,
    );
  }

  await sequelize.transaction(async transaction => {
    await daveUser.update({ defaultBankAccountId: daveBankAccount.id }, { transaction });
    await bankConnection.update({ primaryBankAccountId: daveBankAccount.id }, { transaction });
  });

  await Promise.all([
    logAppsflyerEvent({
      userId: daveUser.id,
      ip: ipAddress,
      appsflyerDeviceId,
      platform,
      eventName: AppsFlyerEvents.DAVE_CHECKING_ACCOUNT_READY,
    }),
    logAppsflyerEvent({
      userId: daveUser.id,
      ip: ipAddress,
      appsflyerDeviceId,
      platform,
      eventName: AppsFlyerEvents.ONE_DAVE_CONVERSION,
      eventValue: 'checking account created',
    }),
  ]);
}
