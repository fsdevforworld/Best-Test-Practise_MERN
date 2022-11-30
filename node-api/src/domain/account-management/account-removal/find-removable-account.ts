import { Advance, BankConnection, Payment, User } from '../../../models';
import { dogstatsd } from '../../../lib/datadog-statsd';
import { AccountRemovalError } from '../account-action';

export async function findRemovableUserById(userId: number): Promise<User> {
  const user = await User.findByPk(userId, {
    include: [Advance, BankConnection, Payment],
  });

  if (!user) {
    dogstatsd.increment('user.remove_by_id.user_already_deleted');
    throw new AccountRemovalError(
      `No user account was found or it has already been deleted. (UserID: ${userId})`,
    );
  }

  const canBeDeleted = await user.canBeDeleted();

  if (!canBeDeleted) {
    dogstatsd.increment('user.remove_by_id.user_cannot_be_deleted');
    throw new AccountRemovalError(`User cannot be deleted. (UserID: ${userId})`);
  }

  return user;
}
