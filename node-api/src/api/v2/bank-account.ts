import { deleteBankConnection } from '../../services/loomis-api/domain/delete-bank-account';
import {
  BankAccountComplexResponse,
  MicroDeposit,
  StandardResponse,
  BankingDataSource,
} from '@dave-inc/wire-typings';
import * as Bluebird from 'bluebird';
import { pick } from 'lodash';
import { Response } from 'express';
import { orderBy } from 'lodash';
import * as BankingDataSync from '../../domain/banking-data-sync';
import { findOneAndHandleSoftDeletes } from '../../domain/banking-data-sync/bank-accounts';
import {
  collectPastDueSubscriptionPayment,
  SUBSCRIPTION_COLLECTION_TRIGGER,
} from '../../domain/collection';
import { AVAILABLE_TO_SPEND_MIN_VERSION } from '../../domain/forecast';
import * as RecurringTransactionDomain from '../../domain/recurring-transaction';
import { upsertSynapsePayUser } from '../../domain/synapsepay';
import SynapsepayNodeLib from '../../domain/synapsepay/node';
import { aggregateBroadcastCalls } from '../../domain/user-updates';
import BankAccountHelper from '../../helper/bank-account';
import UserHelper from '../../helper/user';
import * as EmailVerificationHelper from '../../helper/email-verification';
import {
  ConflictError,
  ForbiddenError,
  InvalidParametersError,
  NotFoundError,
  SynapseMicrodepositVerificationFailure,
  TransactionFetchError,
} from '../../lib/error';
import { dogstatsd } from '../../lib/datadog-statsd';
import logger from '../../lib/logger';
import { moment } from '@dave-inc/time-lib';
import {
  deepTrim,
  getParams,
  isDevEnv,
  minVersionCheckFromRequest,
  shallowMungeObjToCase,
  updateAndGetModifications,
  validateAccountNumber,
  validateRoutingNumber,
} from '../../lib/utils';
import { Advance, AuditLog, BalanceCheck, BankAccount, BankConnection } from '../../models';
import { MicroDepositType } from '../../models/bank-account';
import { serializeBankAccount } from '../../serialization';
import {
  ConstraintMessageKey,
  MicrodepositVerificationKey,
  NotFoundMessageKey,
} from '../../translations';
import {
  BalanceCheckTrigger,
  BalanceLogCaller,
  IDaveRequest,
  IDaveResponse,
  BankingDataSyncSource,
} from '../../typings';

export const MIN_VERSION_ADD_ACCOUNT_ROUTING = '2.39.0';

async function getAll(
  req: IDaveRequest,
  res: IDaveResponse<BankAccountComplexResponse[]>,
): Promise<Response> {
  const showAvailableToSpend = minVersionCheckFromRequest(req, AVAILABLE_TO_SPEND_MIN_VERSION);

  const bankAccounts = await BankAccount.getSupportedAccountsByUserNotDeletedOrDefault(req.user);
  // Sort the accounts so those with hasAccountRouting === true will go before those without
  const sorted = orderBy(bankAccounts, ['hasAccountRouting', 'id'], ['desc', 'desc']);
  const serializedAccounts = await Bluebird.map(sorted, account =>
    serializeBankAccount(account, { showAvailableToSpend }),
  );

  logger.info('Get Bank Account', {
    userId: req.user.id,
    requestId: req.get('X-Request-Id'),
    accounts: serializedAccounts.map(account =>
      pick(account, ['microDeposit', 'institution.id', 'hasAccountRouting', 'hasValidCredentials']),
    ),
  });

  return res.send(serializedAccounts);
}

async function del(req: IDaveRequest, res: Response): Promise<Response> {
  const account = await BankAccount.findByPk(req.params.id);
  if (!account || account.userId !== req.user.id) {
    throw new NotFoundError(`Cannot find account with id: ${req.params.id}`);
  }

  const connection = await BankConnection.findByPk(account.bankConnectionId);
  const connections = await BankConnection.findAll({ where: { userId: req.user.id } });

  if (connections.length <= 1) {
    throw new InvalidParametersError(ConstraintMessageKey.OnlyBankConnection);
  }

  const accounts = await BankAccount.findAll({ where: { bankConnectionId: connection.id } });
  const accountIds = accounts.map(a => a.id);
  const advances = await Advance.findAll({ where: { userId: req.user.id } });

  if (
    advances.find(
      advance => advance.outstanding !== 0 && accountIds.includes(advance.bankAccountId),
    )
  ) {
    throw new ConflictError('Cannot delete an account while you have an active advance');
  }

  await deleteBankConnection(connection);
  return res.send({ success: true });
}

async function notification(req: IDaveRequest, res: Response): Promise<Response> {
  const { bankAccountId } = req.params;

  if (!bankAccountId) {
    throw new InvalidParametersError(null, {
      required: ['bank_account_id'],
      provided: Object.keys(req.body),
    });
  }

  const bankAccount = await BankAccount.findByPk(bankAccountId);

  if (!bankAccount || bankAccount.userId !== req.user.id) {
    throw new NotFoundError(NotFoundMessageKey.BankAccountNotFoundById, {
      interpolations: { bankAccountId },
    });
  }

  const preApprovalWaitlist = moment()
    .startOf('day')
    .format('YYYY-MM-DD');
  await bankAccount.update({ preApprovalWaitlist });
  return res.sendStatus(200);
}

async function delNotification(
  req: IDaveRequest,
  res: IDaveResponse<StandardResponse>,
): Promise<Response> {
  const { bankAccountId } = req.params;

  if (!bankAccountId) {
    throw new InvalidParametersError(null, {
      required: ['bank_account_id'],
      provided: Object.keys(req.body),
    });
  }

  const bankAccount = await BankAccount.findByPk(bankAccountId);

  if (!bankAccount || bankAccount.userId !== req.user.id) {
    throw new NotFoundError(NotFoundMessageKey.BankAccountNotFoundById, {
      interpolations: { bankAccountId },
    });
  }

  await bankAccount.update({ preApprovalWaitlist: null });
  return res.send({ ok: true });
}

async function patch(req: IDaveRequest, res: Response): Promise<Response> {
  const { mainPaycheckRecurringTransactionId } = shallowMungeObjToCase(
    getParams(req.body, [], ['mainPaycheckRecurringTransactionId']),
    'camelCase',
  );

  const { id } = req.params;
  const bankAccountId = id;
  if (!bankAccountId) {
    throw new InvalidParametersError(null, {
      required: ['bank_account_id'],
      provided: Object.keys(req.body),
    });
  }

  const bankAccount = await BankAccount.findByPk(bankAccountId);
  if (!bankAccount || bankAccount.userId !== req.user.id) {
    throw new NotFoundError(NotFoundMessageKey.BankAccountNotFoundById, {
      interpolations: { bankAccountId },
    });
  }

  if (mainPaycheckRecurringTransactionId) {
    const trxn = await RecurringTransactionDomain.getById(mainPaycheckRecurringTransactionId);
    if (!trxn || trxn.bankAccountId !== bankAccount.id) {
      throw new NotFoundError();
    }
    await bankAccount.update({ mainPaycheckRecurringTransactionId });
  }

  return res.sendStatus(200);
}

async function recreateMicroDeposit(
  req: IDaveRequest,
  res: IDaveResponse<{ success: boolean; message: string }>,
): Promise<Response> {
  const user = req.user;
  const bankAccount = await BankAccount.findByPk(req.params.bankAccountId);
  if (!bankAccount || bankAccount.userId !== user.id) {
    throw new NotFoundError(NotFoundMessageKey.BankAccountNotFoundById, {
      interpolations: { bankAccountId: req.params.bankAccountId },
    });
  }

  // Micro deposit can only be re-initiated if the user has tried validating the micro deposit at least once.
  // The user hasn't tried validating
  // can't re-initiate micro deposit because the process is already complete
  if ('COMPLETED' === bankAccount.microDeposit) {
    return res.send({
      success: true,
      message: MicrodepositVerificationKey.BankAccountAlreadyVerified,
    });
  }
  if ('REQUIRED' === bankAccount.microDeposit) {
    logger.error('Error re-creating micro-deposit.', { bankAccount });
    return res.send({
      success: false,
      message: `Please attempt validating micro deposit at least once before resending.`,
    });
  }
  // Can't send micro deposit because the user didn't fail so it must be in another state
  // and we can't send microdeposit
  if ('FAILED' !== bankAccount.microDeposit) {
    return res.send({ success: false, message: `Can not resend micro deposits.` });
  }

  const { success, message } = await SynapsepayNodeLib.reInitiateMicroDeposit(user, bankAccount);
  if (success) {
    const updateParams = {
      microDeposit: 'REQUIRED',
      microDepositCreated: moment().format('YYYY-MM-DD HH:mm:ss'),
    };
    bankAccount.update(updateParams);
  }
  res.send({ success, message });
}

/*
 * fistName, lastName, email required to be create synapsenode
 * for micro-deposit
 */
async function addAccountRouting(
  req: IDaveRequest,
  res: IDaveResponse<{ success: boolean; message: string; microDepositComplete?: boolean }>,
): Promise<Response> {
  const user = req.user;
  const bankAccount = await BankAccount.findByPk(req.params.bankAccountId);
  if (!bankAccount || bankAccount.userId !== user.id) {
    throw new NotFoundError();
  }

  logger.info('Add Account and Routing', {
    userId: req.user.id,
    requestId: req.get('X-Request-Id'),
    account: {
      id: bankAccount.id,
      hashAccountNumber: bankAccount.hasAccountRouting,
    },
  });

  const required = ['account', 'routing', 'firstName', 'lastName', 'email'];
  const params = deepTrim(shallowMungeObjToCase(getParams(req.body, required), 'camelCase'));
  const { account, routing, firstName, lastName, email } = params;

  if (!validateAccountNumber(account)) {
    dogstatsd.increment('bank_account.add_account_routing.invalid_account_number');
    return res.send({
      success: false,
      message: `Account number should be 4-17 digits.`,
    });
  }
  if (!validateRoutingNumber(routing)) {
    dogstatsd.increment('bank_account.add_account_routing.invalid_routing_number');
    return res.send({
      success: false,
      message: `Routing number should be 9 digits.`,
    });
  }
  const [modifications] = await Promise.all([
    updateAndGetModifications(user, { firstName, lastName }),
    EmailVerificationHelper.attemptCreateAndSendEmailVerification({
      id: user.id,
      newEmail: email,
      oldEmail: req.user.email,
    }),
  ]);

  await Promise.all([
    UserHelper.logModifications({
      modifications,
      userId: user.id,
      requestPayload: params,
      type: AuditLog.TYPES.NAME_UPDATE_FROM_ADD_ROUTING,
    }),
    ...aggregateBroadcastCalls({
      userId: user.id,
      modifications,
      updateFields: { firstName, lastName },
      updateSynapse: true,
    }),
  ]);

  const auth = {
    account,
    routing,
  };
  const hashed = BankAccount.hashAccountNumber(auth.account, auth.routing);
  const existingAccount = await BankAccount.findOne({ where: { accountNumber: hashed } });

  if (existingAccount) {
    if (existingAccount.bankConnectionId !== bankAccount.bankConnectionId) {
      dogstatsd.increment('bank_account.add_account_routing.duplicate_account_found');
      throw new ConflictError('Duplicate accounts found', { data: { existingAccount } });
    } else if (bankAccount.synapseNodeId) {
      dogstatsd.increment('bank_account.add_account_routing.synapse_node_already_exists');
      return res.send({
        success: false,
        message: `You entered in the same info last time and I couldn't verify the account.`,
      });
    }
  }

  try {
    const updateParams = {
      lastFour: account.substr(-4),
      microDeposit: 'REQUIRED',
      microDepositCreated: moment().format('YYYY-MM-DD HH:mm:ss'),
    };
    await bankAccount.update(updateParams);
    await bankAccount.updateAccountRouting(account, routing);

    // Check if this user already completed micro deposit for this account
    // Force this account as micro deposit complete and do not create the synapse user
    const matchingDeletedAccounts = await BankAccountHelper.findMatchingDeletedAccounts(
      bankAccount,
    );
    const previousMicroDeposit = matchingDeletedAccounts.find(
      ba => ba.microDeposit === MicroDeposit.COMPLETED,
    );
    if (previousMicroDeposit) {
      await bankAccount.forceMicroDepositComplete();
      dogstatsd.increment('bank_account.add_account_routing.forced_microdeposit_complete');
      return res.send({
        success: true,
        microDepositComplete: true,
        message: `This account already passed micro deposit`,
      });
    }

    if (!user.synapsepayId) {
      // We only need these 3 fields and phoneNumber from user.phoneNumber to
      // create a synapse user node. We are not going to be doing KYC right now.
      dogstatsd.increment('bank_account.add_account_routing.user_without_synapsepay_id');
      const fields = {
        firstName: user.firstName,
        lastName: user.lastName,
        email: email || user.email,
      };
      await upsertSynapsePayUser(user, req.ip, fields);
    }

    await SynapsepayNodeLib.createMicroDeposit(user, bankAccount);
    dogstatsd.increment('bank_account.add_account_routing.synapsepay_microdeposit_complete');
    res.send({
      success: true,
      message: 'Added your account and routing number',
    });
  } catch (err) {
    dogstatsd.increment('bank_account.add_account_routing.error');
    await bankAccount.eraseAccountRouting();
    res.send({
      success: false,
      message: err.message,
    });
  }
}

async function userRefresh(req: IDaveRequest, res: Response): Promise<Response> {
  const { bankAccountId } = req.params;

  const bankAccount = await findOneAndHandleSoftDeletes(bankAccountId, req.user, {
    bankAccountIdFrom: 'params',
  });

  const bankConnection = bankAccount.bankConnection;

  let isAbleToRefreshBalance;

  if (bankConnection.supportsUnlimitedBalanceRefresh()) {
    isAbleToRefreshBalance = true;
  } else {
    const isUserPaused = await req.user.isPaused();
    if (isUserPaused) {
      throw new ForbiddenError("Can't refresh account balance if they are paused.");
    }

    const balanceLastUpdated = await BalanceCheck.findOne({
      where: {
        bankConnectionId: bankAccount.bankConnectionId,
        trigger: BalanceCheckTrigger.USER_REFRESH,
        successful: true,
      },
      order: [['created', 'DESC']],
    });
    isAbleToRefreshBalance =
      !balanceLastUpdated || balanceLastUpdated.created.isBefore(moment(), 'day');
  }

  if (!isDevEnv() && isAbleToRefreshBalance) {
    try {
      // will soft delete primary account if necessary.
      await BankingDataSync.upsertBankAccounts(bankConnection);
    } catch (err) {
      await BankingDataSync.handleBankingDataSourceError(err, bankConnection);
    }
    // recheck for deleted bank account
    await findOneAndHandleSoftDeletes(bankAccountId, req.user, {
      bankAccountIdFrom: 'params',
    });

    // This has some better error handling then fetch transactions do not combine in a promise.all
    await BankingDataSync.refreshBalance(bankAccount, {
      reason: BalanceCheckTrigger.USER_REFRESH,
      caller: BalanceLogCaller.UserRefresh,
    });

    if (
      bankConnection.bankingDataSource === BankingDataSource.Plaid &&
      !bankConnection.initialPull
    ) {
      // Plaid will return an error if we fetch transactions before waiting for initial webhook
      throw new TransactionFetchError(`Can't refresh account before recieving intitial pull.`);
    }

    await BankingDataSync.fetchAndSyncBankTransactions(bankConnection, {
      source: BankingDataSyncSource.UserRefresh,
    });

    await collectPastDueSubscriptionPayment({
      userId: bankAccount.userId,
      trigger: SUBSCRIPTION_COLLECTION_TRIGGER.USER_BALANCE_REFRESH,
      wasBalanceRefreshed: true,
    });
  }

  return res.send();
}

async function verifyMicroDeposit(
  req: IDaveRequest,
  res: IDaveResponse<{ success: boolean; message: string }>,
): Promise<Response> {
  const user = req.user;
  const bankAccount = await BankAccount.findByPk(req.params.bankAccountId);
  if (!bankAccount || bankAccount.userId !== user.id) {
    throw new NotFoundError(NotFoundMessageKey.BankAccountNotFoundById, {
      interpolations: { bankAccountId: req.params.bankAccountId },
    });
  }

  const { amount1, amount2 } = deepTrim(
    shallowMungeObjToCase(getParams(req.body, ['amount1', 'amount2']), 'camelCase'),
  );
  // can't re-initiate micro deposit because the process is already complete
  if ('COMPLETED' === bankAccount.microDeposit) {
    return res.send({
      success: true,
      message: MicrodepositVerificationKey.BankAccountAlreadyVerified,
    });
  }
  const success = await SynapsepayNodeLib.verifyMicroDeposit(user, bankAccount, amount1, amount2);
  if (!success) {
    throw new SynapseMicrodepositVerificationFailure(
      MicrodepositVerificationKey.CantVerifyMicroDeposit,
    );
  }
  const updateParams = {
    microDeposit: MicroDepositType.Completed,
  };
  await bankAccount.update(updateParams);
  res.send({ success, message: MicrodepositVerificationKey.VerifiedMicroDeposit });
}

export default {
  getAll,
  del,
  notification,
  delNotification,
  patch,
  addAccountRouting,
  recreateMicroDeposit,
  userRefresh,
  verifyMicroDeposit,
};
