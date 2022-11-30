import { admin_directory_v1 } from 'googleapis';
import { moment } from '@dave-inc/time-lib';
import { InternalRole, sequelize, InternalUser } from '../../../../models';
import fetchRoleMembers from './fetch-role-members';

async function findOrCreateUsers(emails: string[]) {
  const creates = emails.map(email => ({ email }));
  await InternalUser.bulkCreate(creates, { ignoreDuplicates: true });

  const internalUsers = await InternalUser.findAll({ where: { email: emails } });

  return internalUsers;
}

export default async function syncRole(
  role: InternalRole,
  directoryClient: admin_directory_v1.Admin,
): Promise<void> {
  const memberEmails = await fetchRoleMembers(role.name, directoryClient);
  const internalUsers = await findOrCreateUsers(memberEmails);

  await sequelize.transaction(async t => {
    await role.setInternalUsers(internalUsers, { transaction: t });

    await role.update({ lastSync: moment() }, { transaction: t });
  });
}
