import { dogstatsd } from '../../lib/datadog-statsd';
import * as SynapsePay from 'synapsepay';
import { TransactionJSON } from 'synapsepay';
import { BaseApiError, NotFoundError, NotSupportedError, SynapsePayError } from '../../lib/error';
import * as Bluebird from 'bluebird';
import { get, pick } from 'lodash';
import {
  SYNAPSE_DISBURSEMENT_FEE,
  SYNAPSE_CHARGE_FEE,
  SYNAPSE_CHARGE_FEE_SAME_DAY,
} from '../../domain/payment-provider/synapsepay/gateway';
import { BankAccount, BankConnection, User } from '../../models';
import gcloudKms from '../../lib/gcloud-kms';
import { ExternalTransactionStatus } from '@dave-inc/wire-typings';
import { PaymentProviderTransactionType } from '../../typings';
import { helpers, nodes, transactions } from './external-model-definitions';
import Constants from './constants';
import { SynapsePayUserDetails } from './core';
import { fetchSynapsePayUser, withSynapsePayUser } from './user';
import ErrorHelper from '@dave-inc/error-helper';
import logger from '../../lib/logger';
import { moment } from '@dave-inc/time-lib';
import HeathClient from '../../lib/heath-client';
import { generateBankingDataSource } from '../banking-data-source';

type SynapsePayBankDetails = {
  id?: number;
  synapseNodeId: string;
};

/**
 * Get SynapsePay ACH-US Node
 * @params {Object} user - user table row
 * @params {Object}  BankAccount or object - row from bank_account table for object. Both need to have synapseNodeId
 * @params {extras} extra information like ip etc key:value pairs
 */
async function getSynapsePayNode(
  user: SynapsePayUserDetails,
  account: BankAccount | SynapsePayBankDetails,
  extras: SynapsePay.SynapsePayExtras = {},
) {
  const synapseNodeId =
    account.synapseNodeId || (await createSynapsePayNode(user, account, extras));
  if (!synapseNodeId) {
    throw new NotFoundError(
      `Could not find SynapsePay Node because synapseNodeId is missing for Bank Account id: ${account.id}`,
    );
  }
  return await withSynapsePayUser(user, extras, (synapsePayUser: SynapsePay.User) =>
    nodes.getAsync(synapsePayUser, { _id: synapseNodeId }),
  );
}

/**
 * Gets all SynapsePay Nodes associated with user
 * @params {Object} user - user table row (camelCase)
 */
async function getAllSynapsePayNodes(
  user: SynapsePayUserDetails,
  extras: any = {},
): Promise<SynapsePay.Node[]> {
  const synapsePayUser = await fetchSynapsePayUser(user, extras);
  const nodeJSONs = (await nodes.getAsync(synapsePayUser, null)).nodes;
  return Bluebird.map(nodeJSONs, json => nodes.getAsync(synapsePayUser, { _id: json._id }));
}

/**
 * Creates SynapsePay ACH-US Node
 * @params {Object} user - user table row
 * @params {Object}  BankAccount or object - row from bank_account table for object with account/routing
 * @params {extras} extra information like ip, name, type of account etc key:value pairs
 */
async function createSynapsePayNode(
  user: SynapsePayUserDetails,
  account: BankAccount | SynapsePayBankDetails,
  extras: any = {},
): Promise<string> {
  if (account.synapseNodeId) {
    return account.synapseNodeId;
  }

  if (!user.synapsepayId) {
    throw new NotFoundError(
      `Could not create SynapsePay Node because synapsepayId is missing for User id: ${user.id}`,
    );
  }
  if (!('firstName' in user)) {
    throw new NotFoundError(
      'Could not create SynapsePay Node because detailed user inforamtion was not passed',
    );
  }
  if (!('bankConnectionId' in account)) {
    throw new NotFoundError(
      'Could not create SynapsePay Node because detailed bank account inforamtion was not passed',
    );
  }

  const synapsePayUser = await fetchSynapsePayUser(user, extras);

  const bankConnection = await BankConnection.findByPk(account.bankConnectionId);

  let accountNumber;
  let routingNumber;

  // guards bankingDataSource.getAccountsWithAccountAndRouting() endpoint by first attempting to get account/routing # from our own system
  if (account.accountNumberAes256) {
    const decrypted = await gcloudKms.decrypt(account.accountNumberAes256);
    accountNumber = decrypted.split('|')[0];
    routingNumber = decrypted.split('|')[1];
  } else {
    const bankingDataSource = await generateBankingDataSource(bankConnection);
    const accounts = await bankingDataSource.getAccountsWithAccountAndRouting();
    const accountWithAccountAndRouting = accounts.find(
      a => a.externalId === account.externalId && Boolean(a.account) && Boolean(a.routing),
    );
    if (!accountWithAccountAndRouting) {
      logger.error(`Error getting the correct account/routing for ${account.externalId}`);
      const errMsg =
        "The bank account you added isn't working. Please try adding a different checking account.";
      throw new BaseApiError(errMsg, { statusCode: 400 });
    }
    accountNumber = accountWithAccountAndRouting.account;
    routingNumber = accountWithAccountAndRouting.routing;
    await account.updateAccountRouting(accountNumber, routingNumber);
  }

  const fullName = `${user.firstName} ${user.lastName}`;
  const nickname = extras.nickname || '';
  const nameOnAccount = extras.nameOnAccount || fullName || '';

  const bankTransactions = await getTransactionsForSynapse(account.id);
  if (bankTransactions.length < 1) {
    logger.error(`Transaction not available for ${account.id} synapsenode instant verification`);
    const errMsg =
      "The bank account you added doesn't have enough transactions for instant verification.";
    throw new NotSupportedError(errMsg);
  }

  const achPayload = {
    type: 'ACH-US',
    info: {
      nickname,
      name_on_account: nameOnAccount,
      account_num: accountNumber,
      routing_num: routingNumber,
      type: (extras.type || 'PERSONAL').toUpperCase(),
      class: (extras.class || 'CHECKING').toUpperCase(),
    },
    extra: {
      supp_id: account.id,
      other: {
        transactions: bankTransactions,
      },
    },
  };

  let synapsePayNode;

  try {
    const synapsePayNodes = await nodes.createAsync(synapsePayUser, achPayload);
    synapsePayNode = synapsePayNodes[0];
  } catch (err) {
    logger.error('Error creating SynapsePay node', { err });
    throw new SynapsePayError('Failed to create SynapsePay node', {
      failingService: 'synapse-pay',
      gatewayService: 'node-api',
      data: {
        user: pick(user, ['id', 'synapsePayId', 'legacyId']),
        account: pick(account, ['id', 'synapseNodeId']),
      },
    });
  }

  const nodeJson = synapsePayNode.json;
  if (!nodeJson.allowed || nodeJson.allowed !== 'CREDIT-AND-DEBIT') {
    return null;
  }

  const synapseNodeId = nodeJson._id;
  await account.update({ synapseNodeId });

  return synapseNodeId;
}

async function getTransactionsForSynapse(bankAccountId: number) {
  const dateBack = moment().subtract(30, 'days');
  const [bankTransactions, bankAccount] = await Promise.all([
    HeathClient.getRecentBankTransactions(bankAccountId, dateBack, { limit: 20 }),
    BankAccount.findByPk(bankAccountId),
  ]);
  let currentBalance = bankAccount.current ?? bankAccount.available ?? 0;
  return bankTransactions.map(t => {
    const amount = -1 * t.amount;
    currentBalance -= amount;
    return {
      current_balance: currentBalance,
      amount,
      description: t.externalName,
      date: moment(t.transactionDate).unix(),
      pending: t.pending,
      debit: t.amount < 0,
    };
  });
}

async function charge(
  user: SynapsePayUserDetails,
  bankAccount: SynapsePayBankDetails,
  amount: number,
  referenceId: string,
  {
    isSameDay = true,
    transactionType,
  }: { isSameDay?: boolean; transactionType?: PaymentProviderTransactionType } = {},
) {
  const userNode = await getSynapsePayNode(user, bankAccount);

  if (get(userNode, 'json.allowed') === 'LOCKED') {
    throw new SynapsePayError('Node is locked', {
      failingService: 'synapse-pay',
      gatewayService: 'node-api',
      data: {
        user: pick(user, ['id', 'synapsePayId', 'legacyId']),
        bankAccount: pick(bankAccount, ['id', 'synapseNodeId']),
      },
    });
  }

  let receivingNodeType: string;
  let receivingNodeId: string;

  switch (transactionType) {
    case PaymentProviderTransactionType.SubscriptionPayment:
      receivingNodeId = Constants.SYNAPSEPAY_SUBSCRIPTION_RECEIVING_NODE_ID;
      receivingNodeType = Constants.SYNAPSEPAY_SUBSCRIPTION_RECEIVING_NODE_TYPE;
      break;
    default:
      receivingNodeId = Constants.SYNAPSEPAY_RECEIVING_NODE_ID;
      receivingNodeType = Constants.SYNAPSEPAY_RECEIVING_NODE_TYPE;
      break;
  }

  const createPayload = {
    to: {
      type: receivingNodeType,
      id: receivingNodeId,
    },
    amount: {
      amount,
      currency: 'USD',
    },
    extra: {
      same_day: isSameDay,
      note: referenceId,
      supp_id: referenceId,
      ip: helpers.getUserIP(),
    },
    fees: [
      {
        fee: isSameDay ? SYNAPSE_CHARGE_FEE_SAME_DAY : SYNAPSE_CHARGE_FEE,
        note: 'Transfer fee',
        to: {
          id: Constants.SYNAPSEPAY_FEE_NODE_ID,
        },
      },
    ],
  };

  const transaction = (await transactions.createAsync(userNode, createPayload)).json;

  dogstatsd.increment('synapsepay.create_payment_amount', Number(amount * 100));

  const status = normalizeTransactionStatus(transaction.recent_status.status);
  return { id: transaction._id, status };
}

async function disburse(
  synapseNodeId: string,
  referenceId: string,
  amount: number,
): Promise<TransactionJSON> {
  const disbursingNode = await getSynapsePayNode(
    { synapsepayId: Constants.SYNAPSEPAY_DISBURSING_USER_ID },
    { synapseNodeId: Constants.SYNAPSEPAY_DISBURSING_NODE_ID } as BankAccount,
    { fingerPrint: Constants.SYNAPSEPAY_DISBURSING_USER_FINGERPRINT },
  );

  const createPayload = {
    to: {
      type: Constants.SYNAPSEPAY_DISBURSING_NODE_TYPE,
      id: synapseNodeId,
    },
    amount: {
      amount,
      currency: 'USD',
    },
    extra: {
      same_day: false,
      note: referenceId,
      supp_id: referenceId,
      ip: helpers.getUserIP(),
    },
    fees: [
      {
        fee: SYNAPSE_DISBURSEMENT_FEE,
        note: 'Transfer fee',
        to: {
          id: Constants.SYNAPSEPAY_FEE_NODE_ID,
        },
      },
    ],
  };

  const { json: transaction } = await transactions.createAsync(disbursingNode, createPayload);

  dogstatsd.increment('synapsepay.create_disbursement_amount', Number(amount * 100));

  return transaction;
}

export function normalizeTransactionStatus(status: string): ExternalTransactionStatus {
  const s = (status || '').toUpperCase();
  switch (s) {
    case 'RETURNED':
      return ExternalTransactionStatus.Returned;
    case 'CANCELED':
    case 'CANCELLED':
      return ExternalTransactionStatus.Canceled;
    case 'SETTLED':
      return ExternalTransactionStatus.Completed;
    default:
      return ExternalTransactionStatus.Pending;
  }
}

/**
 * Delete SynapsePay ACH-US Node
 * @params {Object} user - user table row
 * @params {Object}  BankAccount or object - row from bank_account table for object. Both need to have synapseNodeId
 * @params {extras} extra information like ip etc key:value pairs
 */

async function deleteSynapsePayNode(user: User, account: BankAccount, extras = {}) {
  const node = await getSynapsePayNode(user, account, extras);
  await node.deleteAsync();
}

async function createMicroDeposit(user: User, bankAccount: BankAccount) {
  const synapsePayUser = await fetchSynapsePayUser(user);

  const decrypted = await gcloudKms.decrypt(bankAccount.accountNumberAes256);
  const [accountNumber, routingNumber] = decrypted.split('|');

  const fullName = `${user.firstName} ${user.lastName}`;
  const accountType = 'PERSONAL';
  const accountClass = 'CHECKING';
  const nickname = `${fullName} ${accountClass.toLowerCase()}`;
  const achPayload = {
    type: 'ACH-US',
    info: {
      nickname,
      name_on_account: fullName,
      account_num: accountNumber,
      routing_num: routingNumber,
      type: accountType,
      class: accountClass,
      supp_id: bankAccount.id,
    },
  };
  try {
    const response = await nodes.createAsync(synapsePayUser, achPayload);
    const nodeJson = response[0].json;
    const synapseNodeId = nodeJson._id;
    await bankAccount.update({ synapseNodeId });
  } catch (err) {
    logger.error('Error adding account/routing', { err });
    // '1234' is too short..Failed validating 'minLength' in schema['properties']['info']['properties']['account_num']
    // "Invalid field value supplied. 123123123 is not a valid ACH-US routing_num.
    const msg = err.response.body.error.en;
    let errorMsg;
    if (msg.match(/\.Failed validating/)) {
      errorMsg = msg.replace(/Failed validating.*$/, '');
    } else if (msg.match(/is not a valid ACH-US routing_num/)) {
      errorMsg = msg
        .replace(/routing_num/, 'routing number')
        .replace(/Invalid field value supplied\./, '');
    } else {
      errorMsg = 'Error adding your account and routing number';
    }
    throw new Error(errorMsg);
  }
}

async function reInitiateMicroDeposit(user: SynapsePayUserDetails, bankAccount: BankAccount) {
  try {
    const node = await getSynapsePayNode(user, bankAccount);
    await node.resendMicroAsync();
    return { success: true, message: 'Micro deposit resent' };
  } catch (err) {
    logger.error('Re-sending micro deposits failed.', { err });
    const message = err.response.body.error.en || 'Re-sending micro deposits failed.';
    return { success: false, message };
  }
}

async function verifyMicroDeposit(
  user: SynapsePayUserDetails,
  bankAccount: BankAccount,
  amount1: number,
  amount2: number,
) {
  const microPayload = {
    micro: [amount1, amount2],
  };
  const node = await getSynapsePayNode(user, bankAccount);
  let verified: boolean;
  try {
    const response = await node.updateAsync(microPayload);
    verified = response.allowed === 'CREDIT-AND-DEBIT';
  } catch (err) {
    logger.error(`error in verifyMicroDepost `, ErrorHelper.logFormat(err));
    verified = false;
  }
  return verified;
}

export default {
  helpers,
  nodes,
  transactions,
  createSynapsePayNode,
  deleteSynapsePayNode,
  disburse,
  normalizeTransactionStatus,
  getSynapsePayNode,
  getAllSynapsePayNodes,
  charge,
  createMicroDeposit,
  reInitiateMicroDeposit,
  verifyMicroDeposit,
};
