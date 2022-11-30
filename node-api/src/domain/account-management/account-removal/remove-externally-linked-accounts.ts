import { deleteSynapsePayUser } from '../../synapsepay';
import braze from '../../../lib/braze';
import { AuditLog, BankConnection, SynapsepayDocument, User } from '../../../models';
import logger from '../../../lib/logger';
import { deleteMxUser } from '../../../helper/user';
import { deleteBankConnection } from '../../../services/loomis-api/domain/delete-bank-account';
import { AccountRemovalAction } from './types';
import {
  AccountRemovalEvent,
  AccountActionResult,
  PendingAccountActionResult,
  BatchAccountActionsError,
  AccountActionError,
  AccountRemovalError,
} from '../account-action';
import * as ActionProcessor from '../account-action/processor';

import * as allSettled from 'promise.allsettled';
import { getBankConnections } from './user-proxy';
allSettled.shim();

export async function removeAllUserBankConnections(
  user: User,
): Promise<PendingAccountActionResult<void[], AccountActionError>> {
  return Promise.all(
    getBankConnections(user).map(async (connection: BankConnection) =>
      deleteBankConnection(connection),
    ),
  )
    .then(result => {
      return new AccountActionResult({ outcome: 'success', result }).success();
    })
    .catch((err: Error) => {
      const error = new AccountRemovalError(
        `Failure occurred during attempt to remove user's bank connections (removeAllUserBankConnections)`,
        err,
      );
      logger.error(error.message, err);
      throw error;
    });
}

export async function removeExternallyLinkedAccounts(
  user: User,
): Promise<PendingAccountActionResult<AuditLog, BatchAccountActionsError>> {
  const batchOfActions = [
    new AccountRemovalAction(
      'deleteMxUser',
      user.mxUserId ? deleteMxUser(user) : Promise.resolve(undefined),
      logger,
    ),
    new AccountRemovalAction('deleteSynapsePayUser', deleteSynapsePayUser(user), logger),
    new AccountRemovalAction<number>(
      'deleteSynapsePayDocument',
      SynapsepayDocument.destroy({ where: { userId: user.id } }),
      logger,
    ),
    new AccountRemovalAction('deleteBrazeUser', braze.deleteUser(user.id), logger),
  ];
  return ActionProcessor.processBatchAccountActions(
    'remove',
    batchOfActions,
    user,
    AccountRemovalEvent,
  );
}
