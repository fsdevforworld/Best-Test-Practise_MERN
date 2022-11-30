import { DonationOrganizationCode } from '@dave-inc/wire-typings';

import { User } from '../../../../src/models';
import { ActionCode } from '../../../../src/services/internal-dashboard-api/domain/action-log';
import { createUser } from '../../utils';
import factory from '../../../../test/factories';
import { deleteDataForUser } from '../../delete-user';
import { createActionLog, getEmail } from '../utils';

const email = 'advance-changelog@dave.com';

async function up(phoneNumberSeed: string) {
  const user = await createUser({
    firstName: 'Advance Changelog',
    lastName: 'Seed',
    email: getEmail(phoneNumberSeed, email),
  });

  const advance = await factory.create('advance', {
    userId: user.id,
  });

  await factory.create('advance-tip', {
    advanceId: advance.id,
    donationOrganization: DonationOrganizationCode.TREES,
  });

  const actionLog = await createActionLog({
    code: ActionCode.AdvanceTipChange,
    reason: 'Overpaid tip',
  });

  await factory.create('dashboard-advance-modification', {
    advanceId: advance.id,
    dashboardActionLogId: actionLog.id,
    modification: {
      tipAmount: {
        previousValue: 2,
        currentValue: 4,
      },
      tipPercent: {
        previousValue: 5,
        currentValue: 10,
      },
      outstanding: {
        previousValue: 50,
        currentValue: 44,
      },
    },
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
