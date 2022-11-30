import * as superagent from 'superagent';
import * as config from 'config';
import ErrorHelper from '@dave-inc/error-helper';
import { getFingerprint, getSynapsePayUser, helpers, transactions } from '../../synapsepay';
import SynapseNode from '../../synapsepay/node';
import Constants from '../../synapsepay/constants';
import { BankAccount, User } from '../../../models';
import { InvalidParametersError, NotSupportedError, NotImplementedError } from '../../../lib/error';
import {
  IPaymentGateway,
  PaymentGateway,
  PaymentProcessor,
  PaymentProviderTransactionType,
  FetchByExternalOrReferenceOptions,
  FetchTransactionOptions,
  PaymentProviderTransaction,
  CreateTransactionOptions,
  PaymentProviderTransactionStatus,
} from '../../../typings';
import {
  formatTransactionResponse,
  formatFetchTransactionError,
  formatCreateTransactionError,
} from './serializer';
import { TransactionJSON } from 'synapsepay';
import logger from '../../../lib/logger';
import { fetchTransactionDaveUserLimiter } from './fetch-transaction-dave-user-limiter';

const {
  hostUrl: HOST_URL,
  clientId: CLIENT_ID,
  clientSecret: CLIENT_SECRET,
  disbursingUserId: SYNAPSE_USER_ID,
  disbursingNodeId: DISBURSING_NODE_ID,
  disbursingUserFingerprint: SYNAPSE_USER_FINGERPRINT,
  receivingNodeId: RECEIVING_NODE_ID,
} = config.get('synapsepay');

export const SYNAPSE_DISBURSEMENT_FEE = -0.05;
export const SYNAPSE_CHARGE_FEE = -0.05;
export const SYNAPSE_CHARGE_FEE_SAME_DAY = -0.25;

// The getIpAddress function will fail if not connected to the internet
function getAgent() {
  const ipAddress = helpers.getUserIP();
  return superagent
    .agent()
    .set('X-SP-GATEWAY', `${CLIENT_ID}|${CLIENT_SECRET}`)
    .set('X-SP-USER-IP', ipAddress);
}

function getNodeId(type: PaymentProviderTransactionType) {
  switch (type) {
    case PaymentProviderTransactionType.AdvanceDisbursement:
    case PaymentProviderTransactionType.PromotionDisbursement:
      return DISBURSING_NODE_ID;
    case PaymentProviderTransactionType.AdvancePayment:
    case PaymentProviderTransactionType.SubscriptionPayment:
      return RECEIVING_NODE_ID;
    default:
      throw new InvalidParametersError(`Invalid transaction type: ${type}`);
  }
}

async function createTransaction(
  options: CreateTransactionOptions,
): Promise<PaymentProviderTransaction> {
  if (
    options.type !== PaymentProviderTransactionType.AdvanceDisbursement &&
    options.type !== PaymentProviderTransactionType.PromotionDisbursement
  ) {
    // Error is thrown in this case so that it fails loudly during development
    throw new NotImplementedError('Can only disburse from synapse gateway');
  }

  logger.info('PaymentGateway: creating SynapsePay transaction', options);

  const disbursingNode = await SynapseNode.getSynapsePayNode(
    { synapsepayId: Constants.SYNAPSEPAY_DISBURSING_USER_ID } as User,
    { synapseNodeId: Constants.SYNAPSEPAY_DISBURSING_NODE_ID } as BankAccount,
    { fingerPrint: Constants.SYNAPSEPAY_DISBURSING_USER_FINGERPRINT },
  );

  const { amount, referenceId } = options;

  const transactionPayload = {
    to: {
      type: Constants.SYNAPSEPAY_DISBURSING_NODE_TYPE,
      id: options.sourceId,
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

  let transaction: TransactionJSON;
  try {
    const response = await transactions.createAsync(disbursingNode, transactionPayload);
    transaction = response.json;
  } catch (error) {
    const formattedError = ErrorHelper.logFormat(error);

    logger.error('PaymentGateway: failed creating SynapsePay transaction', {
      ...formattedError,
      options,
    });
    return formatCreateTransactionError(error, options);
  }

  return formatTransactionResponse(transaction);
}

function fetchTransactionByExternalId(
  externalId: string,
  options: FetchByExternalOrReferenceOptions,
) {
  const { fingerPrint, nodeId, oauthKey, userId } = options;

  const url = `${HOST_URL}/v3.1/users/${userId}/nodes/${nodeId}/trans/${externalId}`;
  return getAgent()
    .get(url)
    .set('X-SP-USER', `${oauthKey}|${fingerPrint}`);
}

async function fetchTransactionByReferenceId(
  referenceId: string,
  options: FetchByExternalOrReferenceOptions,
) {
  const { fingerPrint, nodeId, oauthKey, userId } = options;

  const url = `${HOST_URL}/v3.1/users/${userId}/nodes/${nodeId}/trans`;
  const response = await getAgent()
    .get(url)
    .set('X-SP-USER', `${oauthKey}|${fingerPrint}`)
    .query(`filter={"extra.supp_id":"${referenceId}"}`);

  // Thrown as a 404 so that fetchTransaction will pass it to the error formatter
  // This keeps the return logic flow consistent with fetchTransactionByExternalId
  if (response.body.trans_count === 0) {
    const errorPayload = {
      status: 404,
      response: {
        error: {
          status: 404,
          text: 'Synapse fetch transactions response did not include the targeted transaction',
          path: url,
        },
      },
    };
    throw errorPayload;
  }
  return response.body.trans[0];
}

async function determineTypeAndFetch(
  ids: { externalId?: string; referenceId?: string },
  options: FetchByExternalOrReferenceOptions,
): Promise<PaymentProviderTransaction> {
  const { externalId, referenceId } = ids;
  if (externalId) {
    const response = await fetchTransactionByExternalId(externalId, options);
    return formatTransactionResponse(response.body);
  } else {
    const transaction = await fetchTransactionByReferenceId(referenceId, options);
    return formatTransactionResponse(transaction);
  }
}

async function fetchTransaction(
  options: FetchTransactionOptions,
): Promise<PaymentProviderTransaction> {
  const { type, externalId, referenceId, secret, sourceId, ownerId } = options;

  if (!externalId && !referenceId) {
    return {
      type,
      externalId: null,
      referenceId: null,
      amount: null,
      gateway: PaymentGateway.Synapsepay,
      outcome: null,
      processor: PaymentProcessor.Synapsepay,
      raw:
        'INVALID_PARAMETERS_ERROR: must provide externalId or referenceId to fetch a transaction ',
      reversalStatus: null,
      status: PaymentProviderTransactionStatus.InvalidRequest,
    };
  }

  logger.info('PaymentGateway: fetching SynapsePay transaction', options);

  // need object with -> external or ref ID, nodeId, synpaseUserId, fingerPrint, oauthKey
  const fetchTransactionOptions = {} as FetchByExternalOrReferenceOptions;
  let user: User;
  if (!secret || !sourceId || !ownerId) {
    const isRateLimited = await fetchTransactionDaveUserLimiter.isRateLimited();
    if (isRateLimited) {
      return {
        type,
        externalId: null,
        referenceId: null,
        amount: null,
        gateway: PaymentGateway.Synapsepay,
        outcome: null,
        processor: PaymentProcessor.Synapsepay,
        raw:
          'RATE LIMIT: Dave user rate limiting hit for fetch transaction, please wait and retry.',
        reversalStatus: null,
        status: PaymentProviderTransactionStatus.RateLimit,
      };
    }
    fetchTransactionOptions.nodeId = getNodeId(type);
    fetchTransactionOptions.userId = SYNAPSE_USER_ID;
    fetchTransactionOptions.fingerPrint = SYNAPSE_USER_FINGERPRINT;
    user = { synapsepayId: SYNAPSE_USER_ID } as User;
  } else {
    fetchTransactionOptions.nodeId = sourceId;
    fetchTransactionOptions.userId = ownerId;
    fetchTransactionOptions.fingerPrint = await getFingerprint(parseInt(secret, 10));
    // TODO in the future don't pass around a fake user object
    user = { synapsepayId: ownerId, id: parseInt(secret, 10) } as User;
  }

  const extras = {
    fingerPrint: fetchTransactionOptions.fingerPrint,
    withoutFullDehydrate: true,
    ip: helpers.getUserIP(),
  };

  const { oauth_key } = await getSynapsePayUser(user, extras);
  fetchTransactionOptions.oauthKey = oauth_key;

  let transaction: PaymentProviderTransaction;
  try {
    transaction = await determineTypeAndFetch({ externalId, referenceId }, fetchTransactionOptions);
  } catch (err) {
    let error = err;
    if (
      err &&
      err.body &&
      err.body.error_code === Constants.SYNAPSEPAY_INVALID_OR_EXPIRED_OAUTH_KEY_ERROR_CODE
    ) {
      try {
        return determineTypeAndFetch({ externalId, referenceId }, fetchTransactionOptions);
      } catch (err) {
        error = err;
      }
    }
    const formattedError = ErrorHelper.logFormat(error);
    logger.error('PaymentGateway: failed fetching SynapsePay transaction', {
      ...formattedError,
      options,
    });
    return formatFetchTransactionError(error, options);
  }

  return transaction;
}

function reverseTransaction(): Promise<PaymentProviderTransaction> {
  // Error is thrown in this case so that it fails loudly during development
  throw new NotSupportedError('Synapsepay does not support reversals');
}

const synapsepayApiInterface: IPaymentGateway = {
  fetchTransaction,
  createTransaction,
  reverseTransaction,
};

export default synapsepayApiInterface;
