import ErrorHelper from '@dave-inc/error-helper';
import { moment } from '@dave-inc/time-lib';
import { Message } from '@google-cloud/pubsub';
import * as Bluebird from 'bluebird';
import { Moment } from 'moment';
import { Op } from 'sequelize';

import { AdvanceApprovalTrigger, DecisionNodeType } from '../../../types';

import { dogstatsd } from '../../../../../lib/datadog-statsd';
import { DecisionNode } from '../../decision-node';
import logger from '../../../../../lib/logger';

import * as AdvanceApprovalEngineDomain from '../../';
import { buildAdvanceApprovalEngine } from '../../build-engine';
import * as MachineLearningDomain from '../../../machine-learning';
import { RecurringTransaction } from '../../../recurring-transaction-client';
import { BankAccount, User, UserAppVersion } from '../../../../../models';

import { BackgroundScoringPreprocessError } from './errors';
import { IUnderwritingMLScorePreprocessEventData } from '../../../../../typings';
import { getTimezone } from '../../../../../domain/user-setting';
import {
  getAdvanceSummary,
  getApprovalBankAccount,
} from '../../../../../domain/advance-approval-request';

enum Metric {
  MessageReceived = 'advance_approval_ml_score_preprocess_job.message_received',
  MessageProcessed = 'advance_approval_ml_score_preprocess_job.message_processed',
  ScoringJobTriggered = 'advance_approval_ml_score_preprocess_job.scoring_job_triggered',
}

/**
 * Pre-processes job determines if a user lands on an ML node in the advance approval engine
 * and triggers a ML scoring job
 *
 * @param {Message} event
 * @param {IUnderwritingMLScorePreprocessEventData} data
 * @returns {Promise<void>}
 */
export async function processEvent(event: Message, data: IUnderwritingMLScorePreprocessEventData) {
  const { bankAccountId } = data;

  dogstatsd.increment(Metric.MessageReceived, {
    trigger: data.trigger,
  });

  try {
    const bankAccount = await BankAccount.findByPk(bankAccountId);
    if (!bankAccount) {
      throw new BackgroundScoringPreprocessError(`Bank account ${bankAccountId} does not exist`);
    }
    if (!bankAccount.isSupported()) {
      throw new BackgroundScoringPreprocessError(`Bank account ${bankAccountId} is not supported`, {
        quiet: true,
      });
    }

    // Using user_app_version table to check for mobile app activity since we upsert a record for every request
    const recentlyActive = Boolean(
      await UserAppVersion.findOne({
        where: {
          userId: bankAccount.userId,
          lastSeen: { [Op.gte]: moment().subtract(3, 'months') },
        },
      }),
    );
    if (!recentlyActive) {
      throw new BackgroundScoringPreprocessError('User has not been active for the last 3 months', {
        quiet: true,
      });
    }

    const user = await bankAccount.getUser();
    if (!user) {
      throw new BackgroundScoringPreprocessError(`User ${bankAccount.userId} does not exist`);
    }

    const engine = buildAdvanceApprovalEngine();
    const runs: Array<{ recurringTransaction?: RecurringTransaction }> = [];

    const recurringTransactions = await AdvanceApprovalEngineDomain.getRecurringTransactionsEligibleForAdvance(
      user.id,
      bankAccountId,
    );

    if (recurringTransactions.length) {
      // Run through advance approval for each recurring transaction
      runs.push(...recurringTransactions.map(recurringTransaction => ({ recurringTransaction })));
    } else {
      // Add a run for tiny money users with no recurring transactions
      runs.push({ recurringTransaction: null });
    }

    // For each run, traverse through advance approval engine until a machine learning node, or the end
    const results = await Bluebird.map(
      runs,
      async ({ recurringTransaction }) => {
        const { node, paybackDate } = await traverseUntilLastNodeOrMachineLearningNode(engine, {
          user,
          bankAccount,
          recurringTransaction,
        });

        return {
          node,
          paybackDate,
        };
      },
      { concurrency: 5 },
    );

    const resultsWithMachineLearningNode = results.filter(
      ({ node }) => node.type === DecisionNodeType.MachineLearning,
    );

    await Bluebird.map(
      resultsWithMachineLearningNode,
      // Trigger scoring job
      async ({ paybackDate }) =>
        MachineLearningDomain.triggerUnderwritingMlScoringJob({
          user_id: user.id,
          bank_account_id: bankAccountId,
          request_date: moment().format('YYYY-MM-DD'),
          payback_date: paybackDate.format('YYYY-MM-DD'),
          trigger: data.trigger,
        }),
      { concurrency: 5 },
    );

    logger.debug(
      `Successfully preprocessed if user is eligible to re-score advance approval ml model`,
      {
        userId: user.id,
        bankAccountId,
        recurringTransactionIds: recurringTransactions.map(({ id }) => id),
        traversedToNodes: results.map(({ node }) => node.name),
        triggeredRescore: Boolean(resultsWithMachineLearningNode.length),
      },
    );

    dogstatsd.increment(Metric.ScoringJobTriggered, resultsWithMachineLearningNode.length);
    dogstatsd.increment(Metric.MessageProcessed, {
      result: 'success',
      trigger: data.trigger,
    });
  } catch (err) {
    const quiet = err instanceof BackgroundScoringPreprocessError && err.quiet;
    if (!quiet) {
      const formattedError = ErrorHelper.logFormat(err);
      logger.error('Error while determining advance approval ml score eligibility', {
        error: formattedError,
        data,
      });
    }

    dogstatsd.increment(Metric.MessageProcessed, {
      result: 'failure',
      trigger: data.trigger,
      error_class: err.constructor.name,
    });
  } finally {
    event.ack();
  }
}

/**
 * Traverses a user through the advance approval engine and stops at either the last node, or a machine learning node
 *
 * @param {DecisionNode} startingNode
 * @param {User} user
 * @param {BankAccount} bankAccount
 * @param {RecurringTransaction} recurringTransaction
 * @returns {Promise<{ node: DecisionNode, paybackDate: Moment }>}
 */
async function traverseUntilLastNodeOrMachineLearningNode(
  startingNode: DecisionNode,
  {
    user,
    bankAccount,
    recurringTransaction,
  }: {
    user: User;
    bankAccount: BankAccount;
    recurringTransaction: RecurringTransaction | null;
  },
): Promise<{ node: DecisionNode; paybackDate: Moment }> {
  const approvalDict = await AdvanceApprovalEngineDomain.buildApprovalDict(
    user.id,
    await getApprovalBankAccount(bankAccount),
    await getAdvanceSummary(user.id),
    recurringTransaction,
    AdvanceApprovalTrigger.MachineLearningEligibility,
    await getTimezone(user.id),
    { auditLog: false },
  );

  const defaultResponse = AdvanceApprovalEngineDomain.getDefaultApprovalResult(approvalDict);

  let node = startingNode;
  let paybackDate = defaultResponse.defaultPaybackDate;

  while (node.type !== DecisionNodeType.MachineLearning) {
    const { result, errors } = await node.evaluateCases(approvalDict, defaultResponse);

    // Some nodes may override the payback date
    paybackDate = result.defaultPaybackDate;

    const nextNode = errors.length ? node.onFailureNode : node.onSuccessNode;
    if (!nextNode) {
      break;
    }

    node = nextNode;
  }

  return { node, paybackDate };
}
