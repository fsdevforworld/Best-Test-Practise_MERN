import * as Bluebird from 'bluebird';
import logger from '../../../../lib/logger';
import { compact, isEqual, uniq } from 'lodash';
import { createFraudRuleHelper, fraudRuleExists, Rule } from '../../../../helper/fraud-rule';
import { DashboardBulkUpdateFraudRule, FraudRule, sequelize, User } from '../../../../models';
import { Transaction } from 'sequelize/types';
import {
  BulkUpdateProcessInput,
  BulkUpdateProcessOutputRow,
  RulesUserMap,
  UnprocessedOutputRow,
} from './dashboard-bulk-update-typings';
import { createBulkUpdateFraudRulesForUser, generateOutputRows } from './helpers';
import { ALREADY_FRAUD_BLOCKED, USER_DOES_NOT_EXIST } from './error-messages';

type PreprocessedUser = {
  originalDaveUserId: number;
  affectedUserIds: number[];
  errorNote?: string;
  rulesToBeRun?: Rule[];
  user?: User;
};

type CreatedRuleResult = {
  fraudRule: FraudRule;
  originalUserIds: Set<number>;
  affectedUsers: User[];
  bulkUpdateFraudRule: DashboardBulkUpdateFraudRule;
};

export async function handleCreateFraudRulesForBulkUpdate(
  ruleUsersMap: RulesUserMap[],
  internalUserId: number,
  dashboardBulkUpdateId: number,
  trx: Transaction,
) {
  return Bluebird.map(
    ruleUsersMap,
    async ruleUsersMapItem => {
      if (ruleUsersMapItem.rule && !(await fraudRuleExists(ruleUsersMapItem.rule, trx))) {
        const createResult = await createFraudRuleHelper(
          ruleUsersMapItem.rule,
          trx,
          internalUserId,
        );
        const bulkUpdateFraudRule = await DashboardBulkUpdateFraudRule.create(
          {
            dashboardBulkUpdateId,
            fraudRuleId: createResult.createdRule.id,
          },
          { transaction: trx },
        );
        return {
          fraudRule: createResult.createdRule,
          originalUserIds: ruleUsersMapItem.originalUserIds,
          affectedUsers: createResult.affectedUsers,
          bulkUpdateFraudRule,
        };
      } else {
        const usersToFraudBlock: User[] = await User.findAll({
          where: { id: Array.from(ruleUsersMapItem.originalUserIds) },
          paranoid: false,
          transaction: trx,
        });
        await Bluebird.map(usersToFraudBlock, async userToFraudBlock => {
          await userToFraudBlock.update({ fraud: true }, { transaction: trx });
        });
        return null;
      }
    },
    { concurrency: 10 },
  );
}

function preprocessBulkFraudUsers(inputUsers: number[], userListFromDB: User[]) {
  return inputUsers.map(inputUserId => {
    const foundUser = userListFromDB.find(user => user.id === inputUserId);

    let errorNote = undefined;
    if (foundUser && foundUser.fraud) {
      errorNote = ALREADY_FRAUD_BLOCKED;
    } else if (!foundUser) {
      errorNote = USER_DOES_NOT_EXIST;
    }
    const preprocessedUser: PreprocessedUser = {
      originalDaveUserId: inputUserId,
      affectedUserIds: [inputUserId],
      errorNote,
      rulesToBeRun: [],
    };

    if (errorNote) {
      return preprocessedUser;
    }

    const errorFraudBlockedUsers = false;
    preprocessedUser.rulesToBeRun = createBulkUpdateFraudRulesForUser(
      foundUser,
      errorFraudBlockedUsers,
    );
    preprocessedUser.user = foundUser;
    return preprocessedUser;
  });
}

/*
 * Needed to keep track of which users generated duplicate rules
 * Output data structure here would be const ruleUsersMap = { Rule, Set(userId[])}
 * The special case where the rule === null, is for when users need to be fraud blocked individually
 */
function generateRuleUsersMap(preprocessedUsers: PreprocessedUser[]) {
  const ruleUsersMap: RulesUserMap[] = [];
  for (const preprocessedUser of preprocessedUsers) {
    if (preprocessedUser.rulesToBeRun?.length > 0) {
      for (const rule of preprocessedUser.rulesToBeRun) {
        const existingRuleUsersMap = ruleUsersMap.find(ruleUsersMapItem =>
          isEqual(rule, ruleUsersMapItem.rule),
        );
        if (existingRuleUsersMap) {
          existingRuleUsersMap.originalUserIds.add(preprocessedUser.originalDaveUserId);
        } else {
          ruleUsersMap.push({
            rule,
            originalUserIds: new Set([preprocessedUser.originalDaveUserId]),
          });
        }
      }
    } else if (!preprocessedUser.errorNote) {
      // This is the special case where the user did not generate rules, but needs to be individually fraud blocked
      const existingNullRule = ruleUsersMap.find(nullRule => nullRule === null);
      if (existingNullRule) {
        existingNullRule.originalUserIds.add(preprocessedUser.originalDaveUserId);
      } else {
        ruleUsersMap.push({
          rule: null,
          originalUserIds: new Set([preprocessedUser.originalDaveUserId]),
        });
      }
    }
  }
  return ruleUsersMap;
}

function updateUserMatches(
  createRulesResults: CreatedRuleResult[],
  preprocessedUsers: PreprocessedUser[],
) {
  const ruleResults = compact(createRulesResults);
  if (ruleResults.length === 0) {
    logger.info('Bulk Updated did not result in any new rules generated');
  }

  // Update the affectedUsers for each rule
  for (const createRulesResult of ruleResults) {
    for (const originalUserId of createRulesResult.originalUserIds) {
      const preprocessedOriginalUser = preprocessedUsers.find(preprocessedUser => {
        return preprocessedUser.originalDaveUserId === originalUserId;
      });
      const affectedUserIds = createRulesResult.affectedUsers.map(li => li.id);
      preprocessedOriginalUser.affectedUserIds = uniq(
        preprocessedOriginalUser.affectedUserIds.concat(affectedUserIds),
      );
    }
  }
}

export function collateAndReduceProcessedUsers(inputs: PreprocessedUser[]): UnprocessedOutputRow[] {
  const outputRows: UnprocessedOutputRow[] = [];
  const affectedUserMap = new Map<number, Set<number>>();

  for (const inputRow of inputs) {
    if (inputRow.errorNote) {
      // When there is an error note, there is only one affected user
      outputRows.push({
        daveUserId: inputRow.originalDaveUserId,
        originalDaveUserIdList: [inputRow.originalDaveUserId],
        errorNote: inputRow.errorNote,
      });
    } else {
      for (const userId of inputRow.affectedUserIds) {
        let originalUserSet: Set<number>;
        if (affectedUserMap.has(userId)) {
          originalUserSet = affectedUserMap.get(userId);
        } else {
          originalUserSet = new Set<number>();
        }
        originalUserSet.add(inputRow.originalDaveUserId);
        affectedUserMap.set(userId, originalUserSet);
      }
    }
  }

  for (const affectedUser of affectedUserMap) {
    outputRows.push({
      daveUserId: affectedUser[0],
      originalDaveUserIdList: Array.from(affectedUser[1]),
      errorNote: undefined,
    });
  }
  //add it to a map of number -> Set<number
  return outputRows.sort((first, second) => (first.daveUserId > second.daveUserId ? 1 : -1));
}

/*
 * Given an input list of unique users (and other metadata) returns a list of output rows
 */
export async function processBulkFraudBlock(
  bulkUpdateInput: BulkUpdateProcessInput,
): Promise<BulkUpdateProcessOutputRow[]> {
  const usersFromDB: User[] = await User.findAll({
    where: { id: bulkUpdateInput.inputUsers },
    paranoid: false,
  });

  // Perform initial checks and generate initial processing rows
  const preprocessedUsers: PreprocessedUser[] = preprocessBulkFraudUsers(
    bulkUpdateInput.inputUsers,
    usersFromDB,
  );

  // Generates a map of rule=> users that made that rule.
  // Automatically deduplicates the rules
  const ruleUsersMap: RulesUserMap[] = generateRuleUsersMap(preprocessedUsers);

  // Perform database operations
  let createRulesResults: CreatedRuleResult[] = [];
  await sequelize.transaction(async trx => {
    createRulesResults = await handleCreateFraudRulesForBulkUpdate(
      ruleUsersMap,
      bulkUpdateInput.internalUserId,
      bulkUpdateInput.dashboardBulkUpdateId,
      trx,
    );
  });

  // Updating preprocessed users with the results. Typescript objects are pass-by reference
  updateUserMatches(createRulesResults, preprocessedUsers);

  // For each of the above, prepare for output row - for output we care about {affectedUser, originalUsersThatAffectedIt}, not {originalUser, affectedUsers}
  const reducedUserList = collateAndReduceProcessedUsers(preprocessedUsers);

  return generateOutputRows(
    reducedUserList,
    bulkUpdateInput.primaryAction,
    bulkUpdateInput.reason,
    bulkUpdateInput.actionLogNote,
  );
}
