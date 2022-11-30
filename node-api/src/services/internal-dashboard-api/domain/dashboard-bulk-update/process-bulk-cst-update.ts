import * as Bluebird from 'bluebird';
import * as getClient from '../../../../domain/bank-of-dave-internal-api';
import logger from '../../../../lib/logger';
import { ActionCode } from '../action-log';
import { ApiAccountType, IInternalApiBankAccount } from '@dave-inc/banking-internal-api-client';
import {
  FAILED_FETCHING_BANK_ACCOUNTS,
  INVALID_CST_OPERATION,
  INVALID_EXTRA_FIELD,
  MISSING_EXTRA_FIELD,
  NO_ACCOUNT_FOUND,
  USER_DOES_NOT_EXIST,
} from './error-messages';
import { InvalidParametersError } from '@dave-inc/error-types';
import { User } from '../../../../models';
import {
  fetchCurrentOutstandingBalance,
  generateOutputRows,
  getUserBankAccounts,
  updateBankAccount,
  updateCardsByAccountId,
} from './helpers';
import {
  BulkUpdateProcessInput,
  BulkUpdateProcessOutputRow,
  UnprocessedOutputRow,
  validAccountTypes,
} from './dashboard-bulk-update-typings';

export const validCstOperations = [
  ActionCode.BulkUpdateCstCancelWithoutRefund,
  ActionCode.BulkUpdateCstSuspend,
];
const BankingInternalApiClient = getClient.default();

/**
 * Updates the input account, and all its related accounts, to a status of CancelledWithoutRefund.
 *
 * @param accountToCancel
 * @param note
 * @returns
 */
export async function processCstCancelWithoutRefund(
  account: IInternalApiBankAccount,
  note?: string,
) {
  await updateBankAccount(BankingInternalApiClient, account.id.toString(), {
    cancelWithoutRefund: true,
  });
  if (note) {
    await updateBankAccount(BankingInternalApiClient, account.id.toString(), {
      accountNote: { note, sticky: true },
    });
  }
}

/**
 * Usually referred to as just "suspend", this operation suspends all the related accounts to the input account
 * and disables all the cards associated with them.
 *
 * @param account
 * @param note
 * @returns
 */
export async function processCstSuspendAndDisable(account: IInternalApiBankAccount, note?: string) {
  await updateBankAccount(BankingInternalApiClient, account.id.toString(), {
    suspend: true,
  });
  await updateCardsByAccountId(BankingInternalApiClient, account.id.toString(), {
    disableCards: true,
  });
  if (note) {
    await updateBankAccount(BankingInternalApiClient, account.id.toString(), {
      accountNote: { note, sticky: true },
    });
  }
}

/**
 * The CST bulk update has its own proprietary fetch accounts because the accounts
 * we want to perform updates on depend on what the user
 *
 * @param user
 * @param accountType
 * @returns
 */
export async function fetchAllAccountsForCstUpdate(user: User, accountType: ApiAccountType) {
  // Fetch all the accounts, even PENDING ones
  const response = await getUserBankAccounts(BankingInternalApiClient, user.id);
  if (!response || !response.data) {
    throw new Error(FAILED_FETCHING_BANK_ACCOUNTS);
  }

  if (!response.data.bankAccounts || response.data.bankAccounts.length === 0) {
    logger.info('No bankAccounts found for current user for bulk CST update');
  }

  if (!response.data.pendingAccounts || response.data.pendingAccounts.length === 0) {
    logger.info('No pendingAccounts found for current user for bulk CST update');
  }

  const allAccounts: IInternalApiBankAccount[] = [
    ...response.data.bankAccounts,
    ...response.data.pendingAccounts,
  ];

  if (allAccounts.length === 0) {
    throw new Error(NO_ACCOUNT_FOUND);
  }

  let accountsToUpdate: IInternalApiBankAccount[];
  if (accountType === ApiAccountType.Checking) {
    // If updating CHECKING, update both CHECKING and GOAL
    accountsToUpdate = allAccounts.filter(account => {
      return (
        account.accountType === ApiAccountType.Checking ||
        account.accountType === ApiAccountType.Goal
      );
    });
  } else if (accountType === ApiAccountType.Goal) {
    // If updating GOAL, update only GOAL
    accountsToUpdate = allAccounts.filter(account => {
      return account.accountType === ApiAccountType.Goal;
    });
  }
  if (!accountsToUpdate || accountsToUpdate.length === 0) {
    throw new Error(NO_ACCOUNT_FOUND);
  }

  return accountsToUpdate;
}

/**
 * Function that will fetch all the accounts that need to be updated for a bulk CST
 * update and performs the specified operation on each account
 *
 * @param user
 * @param note
 * @param accountType
 * @param cstUpdateOperation
 */
export async function cstUpdate(
  user: User,
  accountType: typeof validAccountTypes[number],
  cstUpdateOperation: string,
  note?: string,
) {
  if (!validCstOperations.includes(cstUpdateOperation as ActionCode)) {
    throw new Error(INVALID_CST_OPERATION);
  }

  const accountsToUpdate = await fetchAllAccountsForCstUpdate(user, accountType);

  // Now that we have all the accountIds needed to update, perform the cst operations
  await Bluebird.map(accountsToUpdate, async account => {
    if (cstUpdateOperation === ActionCode.BulkUpdateCstCancelWithoutRefund) {
      await processCstCancelWithoutRefund(account, note);
    } else if (cstUpdateOperation === ActionCode.BulkUpdateCstSuspend) {
      await processCstSuspendAndDisable(account, note);
    }
  });
}

/**
 * Given an input list of unique users (and other metadata) returns a list of output rows
 *
 * @param bulkUpdateInput
 * @returns
 */
export async function processBulkCstUpdate(
  bulkUpdateInput: BulkUpdateProcessInput,
): Promise<BulkUpdateProcessOutputRow[]> {
  const inputUsers = bulkUpdateInput.inputUsers;
  if (!inputUsers || inputUsers.length === 0) {
    logger.info(
      `Dashboard Bulk Update ${bulkUpdateInput.dashboardBulkUpdateId} contains no users to process`,
    );
    return [];
  }

  if (!bulkUpdateInput.extra || !bulkUpdateInput.extra.accountType) {
    throw new InvalidParametersError(MISSING_EXTRA_FIELD);
  }

  const accountType = bulkUpdateInput.extra.accountType;
  if (!validAccountTypes.includes(accountType)) {
    throw new InvalidParametersError(INVALID_EXTRA_FIELD);
  }

  // First fetch all the users, even ones that are deleted
  const userMatches: User[] = await User.findAll({
    where: { id: inputUsers },
    paranoid: false,
  });

  // Process each user individually
  // These are all individual calls to Banking-Api, and that is intended
  // Iterate over the input user list because we want the output to match it
  const bankingApiResults = await Bluebird.map(
    bulkUpdateInput.inputUsers,
    async userIdToUpdate => {
      const foundUser = userMatches.find(possibleUser => possibleUser.id === userIdToUpdate);

      if (foundUser) {
        const unprocessedOutputRow: UnprocessedOutputRow = {
          daveUserId: userIdToUpdate,
          originalDaveUserIdList: [userIdToUpdate],
          outstandingBalanceBeforeAction: await fetchCurrentOutstandingBalance(foundUser),
        };
        try {
          await cstUpdate(
            foundUser,
            accountType,
            bulkUpdateInput.primaryAction,
            bulkUpdateInput.actionLogNote,
          );
        } catch (error) {
          // The following is useful for failures on BPS or banking-api
          if (error.response && error.response.data && error.response.data.message) {
            unprocessedOutputRow.errorNote = `${error.message}, ${error.response.data.message}`;
          } else {
            unprocessedOutputRow.errorNote = error.message;
          }
          logger.error(unprocessedOutputRow.errorNote, error);
        }

        return unprocessedOutputRow;
      } else {
        const unprocessedOutputRow: UnprocessedOutputRow = {
          daveUserId: userIdToUpdate,
          originalDaveUserIdList: [userIdToUpdate],
          outstandingBalanceBeforeAction: 0,
          errorNote: USER_DOES_NOT_EXIST,
        };
        return unprocessedOutputRow;
      }
    },
    {
      // Limiting concurrency to 2 for now, so as to not overwhelm banking-api or galileo
      concurrency: 2,
    },
  );

  // Generate the output file
  return generateOutputRows(
    bankingApiResults,
    bulkUpdateInput.primaryAction,
    bulkUpdateInput.reason,
    bulkUpdateInput.actionLogNote,
  );
}
