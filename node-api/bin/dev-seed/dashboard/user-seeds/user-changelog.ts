import {
  User,
  EmailVerification,
  DashboardActionLogEmailVerification,
} from '../../../../src/models';
import factory from '../../../../test/factories';
import { createUser } from '../../utils';
import { deleteDataForUser } from '../../delete-user';
import { createActionLog, getEmail } from '../utils';
import { ActionCode } from '../../../../src/services/internal-dashboard-api/domain/action-log';

const email = 'user-changelog@dave.com';

async function up(phoneNumberSeed: string) {
  const user = await createUser({
    firstName: 'User Changelog',
    lastName: 'Seed',
    email: getEmail(phoneNumberSeed, email),
  });

  const verification = await factory.create<EmailVerification>('email-verification', {
    userId: user.id,
  });

  const actionLog = await createActionLog({
    code: ActionCode.CreateEmailVerification,
    reason: 'Customer no longer uses email on file',
  });

  await DashboardActionLogEmailVerification.create({
    emailVerificationId: verification.id,
    dashboardActionLogId: actionLog.id,
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
