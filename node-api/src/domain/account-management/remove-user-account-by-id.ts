import { DeleteRequest, User } from '../../models';
import logger from '../../lib/logger';
import {
  AccountActionSuccess,
  AccountRemovalError,
  BatchAccountActionsError,
} from './account-action';
import {
  findRemovableUserById,
  IAccountRemovalRequest,
  removeExternallyLinkedAccounts,
  removeAllUserBankConnections,
} from './account-removal';

const DUPLICATE_ACCOUNT = 'duplicate account';

function loggedAccountRemovalError(err: Error, errMessage?: string): AccountRemovalError {
  const isExpectedErrorType =
    err instanceof AccountRemovalError || err instanceof BatchAccountActionsError;
  const error = isExpectedErrorType ? err : new AccountRemovalError(errMessage || err.message, err);
  logger.error(error.message, error);
  return error as AccountRemovalError;
}

export async function removeUserAccountById({
  userId,
  reason,
  options = { additionalInfo: '', shouldOverrideSixtyDayDelete: false },
}: IAccountRemovalRequest): Promise<AccountActionSuccess<DeleteRequest>> {
  try {
    const { additionalInfo, shouldOverrideSixtyDayDelete } = options;

    const user = await findRemovableUserById(userId);

    const deleteRequest = await DeleteRequest.create({
      userId,
      reason,
      additionalInfo,
    });

    await removeAllUserBankConnections(user).catch((error: Error) => {
      throw loggedAccountRemovalError(
        error,
        `Failure during attempt to remove users bank connections.`,
      );
    });

    await removeExternallyLinkedAccounts(user).catch((error: Error) => {
      throw loggedAccountRemovalError(
        error,
        `Failure during removal of user's externally linked accounts!`,
      );
    });

    const overrideSixtyDayDelete = shouldOverrideSixtyDayDelete || reason === DUPLICATE_ACCOUNT;

    await User.softDeleteUserAccount(user, overrideSixtyDayDelete).catch((error: Error) => {
      throw loggedAccountRemovalError(
        error,
        `Failure running SQL query to soft delete the user. (60dayDeleteOverride: ${overrideSixtyDayDelete})`,
      );
    });

    return new AccountActionSuccess(deleteRequest);
  } catch (err) {
    throw loggedAccountRemovalError(err, err.message);
  }
}
