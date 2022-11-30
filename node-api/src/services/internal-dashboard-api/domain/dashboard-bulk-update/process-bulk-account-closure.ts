import * as Bluebird from 'bluebird';
import AccountManagement from '../../../../domain/account-management';
import logger from '../../../../lib/logger';
import { DashboardActionLogDeleteRequest, User } from '../../../../models';
import { moment } from '@dave-inc/time-lib';
import { USER_ALREADY_DELETED, USER_DOES_NOT_EXIST } from './error-messages';
import {
  BulkUpdateProcessInput,
  BulkUpdateProcessOutputRow,
  UnprocessedOutputRow,
} from './dashboard-bulk-update-typings';
import {
  fetchCurrentOutstandingBalance,
  generateOutputRows,
  clearOutstandingBalance,
} from './helpers';

type UserToDelete = {
  userId: number;
  user: User;
  outstandingBalanceBeforeAction: number;
};

async function closeAccounts(
  usersToDelete: UserToDelete[],
  reason: string,
  internalUserId: number,
  dashboardActionLogId: number,
): Promise<UnprocessedOutputRow[]> {
  // create data structure for output file
  const outputUserList: UnprocessedOutputRow[] = [];

  for (const userToDelete of usersToDelete) {
    const defaultOutputRow = {
      daveUserId: userToDelete.userId,
      originalDaveUserIdList: [userToDelete.userId],
      errorNote: USER_DOES_NOT_EXIST,
      outstandingBalanceBeforeAction: userToDelete.outstandingBalanceBeforeAction,
    };
    if (!userToDelete.user) {
      // In this case the user was found neither normally or when looking for deleted users
      defaultOutputRow.errorNote = USER_DOES_NOT_EXIST;
      outputUserList.push(defaultOutputRow);
    } else if (userToDelete.user.deleted && userToDelete.user.deleted.isBefore(moment())) {
      // In this case the user exists but is already deleted
      defaultOutputRow.errorNote = USER_ALREADY_DELETED;
      outputUserList.push(defaultOutputRow);
    } else {
      try {
        // This is the most common case
        // Before deleting the user, zero out their outstanding balance
        if (userToDelete.outstandingBalanceBeforeAction > 0) {
          await clearOutstandingBalance(userToDelete.user, internalUserId);
        }

        // Delete the user
        const removalResult = await AccountManagement.removeUserAccountById({
          userId: userToDelete.userId,
          reason,
        });

        const deleteRequestId = removalResult.result.id;

        await DashboardActionLogDeleteRequest.create({
          dashboardActionLogId,
          deleteRequestId,
        });

        // Success!
        outputUserList.push({
          daveUserId: userToDelete.userId,
          originalDaveUserIdList: [userToDelete.userId],
          outstandingBalanceBeforeAction: userToDelete.outstandingBalanceBeforeAction,
        });
      } catch (error) {
        logger.error(`Failed closing account for user ${userToDelete.userId}.`, {
          error,
        });
        let errorNote = error.toString();
        const canBeDeleted = userToDelete.user.canBeDeleted();
        const hasOutstandingAdvances = await userToDelete.user.hasOutstandingAdvances(); //Should not be possible
        const hasDaveBanking = await userToDelete.user.hasDaveBanking();

        if (!canBeDeleted) {
          if (hasOutstandingAdvances) {
            errorNote = errorNote + ' User has outstanding advances.';
          }
          if (hasDaveBanking) {
            errorNote = errorNote + ' User has Dave Banking.';
          }
          if (!hasOutstandingAdvances && !hasDaveBanking) {
            errorNote = errorNote + ' User has pending payments.';
          } else {
            errorNote = errorNote + ' User might have pending payments.';
          }
        }
        defaultOutputRow.errorNote = errorNote;
        outputUserList.push(defaultOutputRow);
      }
    }
  }
  return outputUserList;
}

/*
 * Given an input list of unique users (and other metadata) returns a list of output rows
 */
export async function processBulkAccountClosure(
  bulkUpdateInput: BulkUpdateProcessInput,
): Promise<BulkUpdateProcessOutputRow[]> {
  // First fetch all the users so we can get their current balance
  const userMatches = await User.findAll({
    where: { id: bulkUpdateInput.inputUsers },
    paranoid: false,
  });

  const usersToDelete: UserToDelete[] = await Bluebird.map(
    bulkUpdateInput.inputUsers,
    async userId => {
      const user = userMatches.find(foundUser => foundUser.id === userId);
      const outstandingBalanceBeforeAction = user
        ? await fetchCurrentOutstandingBalance(user)
        : undefined;
      return { userId, user, outstandingBalanceBeforeAction };
    },
    { concurrency: 10 },
  );

  // close the accounts
  const outputUserList = await closeAccounts(
    usersToDelete,
    bulkUpdateInput.reason,
    bulkUpdateInput.internalUserId,
    bulkUpdateInput.dashboardActionLogId,
  );

  // Generate the output file
  return generateOutputRows(
    outputUserList,
    bulkUpdateInput.primaryAction,
    bulkUpdateInput.reason,
    bulkUpdateInput.actionLogNote,
  );
}
