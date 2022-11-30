import * as config from 'config';
import { InternalRole, InternalUser } from '../../../../src/models';

const internalUserEmailConfig = 'internalDashboardApi.seeds.internalUserEmail';

const internalUserEmail = config.has(internalUserEmailConfig)
  ? config.get<string>(internalUserEmailConfig)
  : null;

export async function up(phoneNumberSeed: string) {
  const adminRole = await InternalRole.findOne({
    where: { name: 'overdraftAdmin' },
    rejectOnEmpty: true,
  });

  const bulkUpdateRole = await InternalRole.findOne({
    where: { name: 'bulkUpdateAdmin' },
    rejectOnEmpty: true,
  });

  const [internalUser] = await InternalUser.findCreateFind({
    where: {
      email: internalUserEmail || `dev-${phoneNumberSeed}@dave.com`,
    },
  });

  if (internalUser) {
    await internalUser.setInternalRoles([adminRole, bulkUpdateRole]);
  }
}

export async function down(phoneNumberSeed: string) {
  const internalUser = await InternalUser.findOne({
    where: {
      email: internalUserEmail || `dev-${phoneNumberSeed}@dave.com`,
    },
  });

  if (internalUser) {
    await internalUser.setInternalRoles([]);
    await internalUser.destroy();
  }
}
