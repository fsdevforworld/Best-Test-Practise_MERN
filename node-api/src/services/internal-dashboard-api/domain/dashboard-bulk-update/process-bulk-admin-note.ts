import * as Bluebird from 'bluebird';
import logger from '../../../../lib/logger';
import { AdminComment, sequelize, User } from '../../../../models';
import { generateOutputRows } from './helpers';
import { USER_DOES_NOT_EXIST } from './error-messages';
import {
  BulkUpdateProcessInput,
  BulkUpdateProcessOutputRow,
  UnprocessedOutputRow,
} from './dashboard-bulk-update-typings';

export type UserForAdminNote = {
  userId: number;
  user: User;
};

async function createAdminNotes(
  usersForAdminNotes: UserForAdminNote[],
  note: string,
  isHighPriority: boolean,
  internalUserId: number,
): Promise<UnprocessedOutputRow[]> {
  // Create db transaction
  const dbTransaction = await sequelize.transaction();

  // keeping track of the users that exist so we can easily fetch the admin notes later
  const usersToFetch: number[] = await Bluebird.map(usersForAdminNotes, async userForNote => {
    if (userForNote.user) {
      await AdminComment.create(
        {
          userId: userForNote.userId,
          message: note,
          isHighPriority,
          authorId: internalUserId,
        },
        { transaction: dbTransaction },
      );
      return userForNote.userId;
    }
  });

  const filteredUsersToFetch = usersToFetch.filter(li => li);

  //Run the transaction
  try {
    await dbTransaction.commit();
  } catch (error) {
    logger.error(
      `Failed adding Bulk Admin Notes. Rolling back transaction. Error: ${error.message}`,
    );

    // Bubble it up
    throw error;
  }

  // get the users from the transaction
  const fetchedUserAdminNotes = await AdminComment.findAll({
    where: { userId: filteredUsersToFetch },
  });

  return usersForAdminNotes.map(userForNote => {
    const foundAdminNote = fetchedUserAdminNotes.find(
      adminNote => adminNote.userId === userForNote.userId,
    );
    return {
      daveUserId: userForNote.userId,
      originalDaveUserIdList: [userForNote.userId],
      errorNote: userForNote.user ? undefined : USER_DOES_NOT_EXIST,
      daveDashAdminNote: foundAdminNote ? foundAdminNote.message : undefined,
    };
  });
}
/*
 * Given an input list of unique users (and other metadata) returns a list of output rows
 */
export async function processBulkAdminNote(
  bulkUpdateInput: BulkUpdateProcessInput,
): Promise<BulkUpdateProcessOutputRow[]> {
  const inputUsers = bulkUpdateInput.inputUsers;
  if (!inputUsers || inputUsers.length === 0) {
    logger.info(
      `Dashboard Bulk Update ${bulkUpdateInput.dashboardBulkUpdateId} contains no users to process`,
    );
    return [];
  }

  // First fetch all the users, even ones that are deleted
  const userMatches = await User.findAll({
    where: { id: inputUsers },
    paranoid: false,
  });

  // Get all the Users from the DB - so we can link them with the notes
  const usersForNotes: UserForAdminNote[] = inputUsers.map(userId => {
    const user = userMatches.find(foundUser => foundUser.id === userId);
    return { userId, user };
  });

  let isHighPriority = false;
  if (bulkUpdateInput.extra && bulkUpdateInput.extra.isHighPriorityAdminNote) {
    isHighPriority = bulkUpdateInput.extra.isHighPriorityAdminNote;
  }

  // add the notes
  const outputUserList = await createAdminNotes(
    usersForNotes,
    bulkUpdateInput.actionLogNote,
    isHighPriority,
    bulkUpdateInput.internalUserId,
  );

  // Generate the output file
  return generateOutputRows(
    outputUserList,
    bulkUpdateInput.primaryAction,
    bulkUpdateInput.reason,
    bulkUpdateInput.actionLogNote,
  );
}
