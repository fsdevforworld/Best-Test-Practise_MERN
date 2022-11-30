import * as Bluebird from 'bluebird';
import * as config from 'config';
import { InstanceUpdateOptionsWithMetadata } from '../../../../typings/sequelize';
import { Rule } from '../../../../helper/fraud-rule';
import { User } from '../../../../models';
import {
  BulkUpdateConfig,
  BulkUpdateProcessOutputRow,
  UnprocessedOutputRow,
} from './dashboard-bulk-update-typings';
import {
  IInternalApiUpdateBankAccountRequest,
  V1Api,
  IInternalApiUpdateCardsRequest,
} from '@dave-inc/banking-internal-api-client';
import { ALREADY_FRAUD_BLOCKED, USER_ALREADY_DELETED } from './error-messages';

export const bulkUpdateConfig: BulkUpdateConfig = config.get(
  'internalDashboardApi.dashboardBulkUpdate',
);

// Wrapper function for the banking client updateBankAccount
async function updateBankAccount(
  bankingInternalApiClient: V1Api,
  bankAccountId: string,
  updateAccountFields: IInternalApiUpdateBankAccountRequest,
  options?: any,
): Promise<any> {
  return await bankingInternalApiClient.updateBankAccount(
    bankAccountId,
    updateAccountFields,
    options,
  );
}

// Wrapper function for the banking client getUserBankAccounts
async function getUserBankAccounts(bankingInternalApiClient: V1Api, userId: number): Promise<any> {
  return await bankingInternalApiClient.getUserBankAccounts(userId);
}

// Wrapper function for the banking client updateBankAccount
async function updateCardsByAccountId(
  bankingInternalApiClient: V1Api,
  bankAccountId: string,
  updateCardsFields: IInternalApiUpdateCardsRequest,
  options?: any,
): Promise<any> {
  return await bankingInternalApiClient.updateCardsByBankAccountId(
    bankAccountId,
    updateCardsFields,
    options,
  );
}

function createBulkUpdateFraudRulesForUser(user: User, errorFraudBlockedUsers: boolean): Rule[] {
  const rulesToReturn: Rule[] = [];

  if (!user) {
    throw new Error(USER_ALREADY_DELETED);
  }
  if (errorFraudBlockedUsers && user.fraud) {
    throw new Error(ALREADY_FRAUD_BLOCKED);
  }

  const firstName = user.firstName?.toLowerCase();
  const lastName = user.lastName?.toLowerCase();
  const userAddress1 = user.addressLine1?.toLowerCase();
  const userCity = user.city?.toLowerCase();
  const userState = user.state?.toLowerCase();
  const userZipCode = user.zipCode?.toLowerCase();

  // Create fraud rule for phone
  if (user.phoneNumber && user.isActive()) {
    rulesToReturn.push({
      phoneNumber: user.phoneNumber,
    } as Rule);
  }

  // Create fraud rule for email
  if (user.email) {
    rulesToReturn.push({
      email: user.email,
    } as Rule);
  }

  // Create fraud rule for user and address
  if (firstName && lastName && userAddress1 && userCity && userState && userZipCode) {
    rulesToReturn.push({
      firstName,
      lastName,
      addressLine1: userAddress1,
      addressLine2: user.addressLine2 ? user.addressLine2.toLowerCase() : null,
      city: userCity.toLowerCase(),
      state: userState.toLowerCase(),
      zipCode: userZipCode,
    } as Rule);
  }

  return rulesToReturn;
}

async function fetchCurrentOutstandingBalance(user: User): Promise<number> {
  const advances = await user.getAdvances();
  return advances.reduce((acc, curr) => (acc += curr.outstanding), 0);
}

async function generateOutputRows(
  reducedUserLists: UnprocessedOutputRow[],
  primaryAction: string,
  reason: string,
  note: string,
): Promise<BulkUpdateProcessOutputRow[]> {
  return await Bluebird.map(reducedUserLists, async reducedUser => {
    const currentUser = await User.findByPk(reducedUser.daveUserId, { paranoid: false });
    return {
      daveUserId: reducedUser.daveUserId.toString(),
      originalDaveUserIdList: reducedUser.originalDaveUserIdList.toString(),
      dateTimeActionTaken: new Date().toISOString(),
      primaryAction,
      reason,
      actionLog: note,
      daveDashAdminNote: reducedUser.daveDashAdminNote,
      outstandingBalanceBeforeAction: reducedUser.outstandingBalanceBeforeAction,
      currentOutstandingBalance: currentUser
        ? await fetchCurrentOutstandingBalance(currentUser)
        : undefined,
      error: reducedUser.errorNote ? reducedUser.errorNote : undefined,
    };
  });
}

async function clearOutstandingBalance(user: User, internalUserId: number) {
  const advances = await user.getAdvances();
  for (const advance of advances) {
    if (advance.outstanding > 0) {
      await advance.update({ outstanding: 0, paybackFrozen: true }, {
        metadata: { source: 'admin', adminId: internalUserId },
      } as InstanceUpdateOptionsWithMetadata);
    }
  }
}

export {
  clearOutstandingBalance,
  createBulkUpdateFraudRulesForUser,
  fetchCurrentOutstandingBalance,
  generateOutputRows,
  getUserBankAccounts,
  updateBankAccount,
  updateCardsByAccountId,
};
