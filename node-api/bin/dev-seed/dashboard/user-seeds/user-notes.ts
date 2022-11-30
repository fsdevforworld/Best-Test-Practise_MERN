import { moment } from '@dave-inc/time-lib';
import { AdminComment, DashboardUserNote, User } from '../../../../src/models';
import { ActionCode } from '../../../../src/services/internal-dashboard-api/domain/action-log';
import { NotePriorityCode } from '../../../../src/services/internal-dashboard-api/domain/note';
import factory from '../../../../test/factories';
import { deleteDataForUser } from '../../delete-user';
import { createInternalUser, createUser } from '../../utils';
import { createActionLog, getEmail } from '../utils';

const email = 'user-notes@dave.com';

async function up(phoneNumberSeed: string) {
  const [{ id: userId }, actionLog, internalUser] = await Promise.all([
    createUser({
      firstName: 'User Notes',
      lastName: 'Seed',
      email: getEmail(phoneNumberSeed, email),
    }),
    createActionLog({
      code: ActionCode.CreateUserNote,
      reason: 'Agent note',
    }),
    createInternalUser(),
  ]);

  await Promise.all([
    factory.create<AdminComment>('admin-comment', {
      userId,
      authorId: internalUser.id,
      isHighPriority: false,
      created: moment().subtract(1, 'day'),
    }),
    factory.create<DashboardUserNote>('dashboard-user-note', {
      userId,
      dashboardNotePriorityCode: NotePriorityCode.Default,
      dashboardActionLogId: actionLog.id,
      created: moment(),
    }),
    factory.create<DashboardUserNote>('dashboard-user-note', {
      userId,
      dashboardNotePriorityCode: NotePriorityCode.High,
      dashboardActionLogId: actionLog.id,
      created: moment().subtract(3, 'day'),
    }),
    factory.create<AdminComment>('admin-comment', {
      userId,
      authorId: internalUser.id,
      isHighPriority: true,
      created: moment().subtract(2, 'day'),
    }),
  ]);
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
