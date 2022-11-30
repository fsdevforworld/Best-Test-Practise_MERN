import * as superagent from 'superagent';
import * as config from 'config';
import { get as _get } from 'lodash';
import ErrorHelper from '@dave-inc/error-helper';
import {
  IPaymentGateway,
  FetchTransactionOptions,
  TabapayRetrieveTransactionResponse,
  PaymentProviderTransactionType,
  ReverseTransactionOptions,
  CreateTransactionOptions,
  TabapayRequestTransactionType,
  PaymentProviderTransaction,
  TabapayCreateTransactionResponse,
  TabapayRequestTransactionStatus,
  TabapayReverseTransactionResponse,
} from '@dave-inc/loomis-client';
import { InvalidParametersError } from '../../../lib/error';
import {
  formatCreateTransactionError,
  formatCreateTransactionResponse,
  formatFetchTransactionError,
  formatFetchTransactionResponse,
  formatReverseTransactionError,
  formatReverseTransactionResponse,
} from './serializer';
import logger from '../../../lib/logger';

const {
  advanceSubId: ADVANCE_SUB_CLIENT_ID,
  clientId: CLIENT_ID,
  bankFundingSubId: BANK_FUNDING_SUB_CLIENT_ID,
  subscriptionSubId: SUBSCRIPTION_SUB_CLIENT_ID,
  settlementAccount: SETTLEMENT_ACCOUNT,
  token,
  url: baseUrl,
} = config.get('tabapay');

export function getAgent() {
  return superagent.agent().set('Authorization', `Bearer ${token}`);
}

export function getUrl(path: string, type: PaymentProviderTransactionType) {
  const HOST_URL = `https://${baseUrl}/v1/clients/${CLIENT_ID}_`;

  if (type === PaymentProviderTransactionType.SubscriptionPayment) {
    return `${HOST_URL}${SUBSCRIPTION_SUB_CLIENT_ID}${path}`;
  }

  if (type === PaymentProviderTransactionType.BankFunding) {
    return `${HOST_URL}${BANK_FUNDING_SUB_CLIENT_ID}${path}`;
  }

  return `${HOST_URL}${ADVANCE_SUB_CLIENT_ID}${path}`;
}

export function formatType(type: PaymentProviderTransactionType) {
  switch (type) {
    case PaymentProviderTransactionType.AdvanceDisbursement:
      return TabapayRequestTransactionType.Push;
    case PaymentProviderTransactionType.SubscriptionPayment:
    case PaymentProviderTransactionType.AdvancePayment:
      return TabapayRequestTransactionType.Pull;
    default:
      throw new InvalidParametersError(`type: ${type} is not valid`);
  }
}

function formatAccounts(type: PaymentProviderTransactionType, sourceId: string) {
  switch (type) {
    case PaymentProviderTransactionType.AdvanceDisbursement:
      return {
        sourceAccountID: SETTLEMENT_ACCOUNT,
        destinationAccountID: sourceId,
      };
    case PaymentProviderTransactionType.SubscriptionPayment:
    case PaymentProviderTransactionType.AdvancePayment:
      return {
        sourceAccountID: sourceId,
        destinationAccountID: SETTLEMENT_ACCOUNT,
      };
    default:
      throw new InvalidParametersError(`type: ${type} is not valid`);
  }
}

export async function reverseTabapayTransaction(
  options: ReverseTransactionOptions,
  isAchTransaction: boolean,
): Promise<PaymentProviderTransaction> {
  const { externalId, type } = options;
  if (
    type !== PaymentProviderTransactionType.AdvancePayment &&
    type !== PaymentProviderTransactionType.SubscriptionPayment
  ) {
    // Error is thrown in this case so that it fails loudly during development
    throw new InvalidParametersError(`Transaction type: ${type} cannot be reversed`);
  }
  logger.info('PaymentGateway: reversing Tabapay transaction', options);

  const url = getUrl(`/transactions/${externalId}?reversal`, type);
  let response;
  try {
    const res = await getAgent().delete(url);
    response = JSON.parse(res.text) as TabapayReverseTransactionResponse;
  } catch (error) {
    const formattedError = ErrorHelper.logFormat(error);
    logger.error('PaymentGateway: failed reversing Tabapay transaction', {
      ...formattedError,
      options,
    });

    // double check that this resp body can be expected
    const res = _get(error, 'response', {});
    const resBody = res.body && Object.keys(res.body || {}).length > 0 ? res.body : null;
    const payload = resBody || { SC: error.status || 500, EC: 'unknown' };
    return formatReverseTransactionError(payload, { externalId, type }, { isAchTransaction });
  }

  if (response.status === TabapayRequestTransactionStatus.Error) {
    return formatReverseTransactionResponse(response, { externalId, type }, { isAchTransaction });
  }

  return fetchTabapayTransaction({ externalId, type }, isAchTransaction);
}

async function createTransaction(options: CreateTransactionOptions) {
  logger.info('PaymentGateway: creating Tabapay transaction', options);

  const { referenceId: referenceID, type, amount, sourceId } = options;
  const url = getUrl('/transactions', type);

  const payload = {
    referenceID,
    type: formatType(type),
    accounts: formatAccounts(type, sourceId),
    amount: amount.toFixed(2),
  };

  let response;
  try {
    const res = await getAgent()
      .post(url)
      .send(payload);
    const parsed: TabapayCreateTransactionResponse = JSON.parse(res.text);
    response = formatCreateTransactionResponse(parsed, options);
  } catch (error) {
    logger.error('PaymentGateway: failed creating Tabapay transaction', { error, options });
    response = formatCreateTransactionError(error, options);
  }

  return response;
}

export async function fetchTabapayTransaction(
  options: FetchTransactionOptions,
  isAchTransaction: boolean,
): Promise<PaymentProviderTransaction> {
  const { externalId: transactionId, referenceId, type } = options;

  if (!transactionId && !referenceId) {
    // Error is thrown in this case so that it fails loudly during development
    throw new InvalidParametersError('Must include an transactionId or referenceId');
  }
  logger.info('PaymentGateway: fetching Tabapay transaction', options);

  let path = '/transactions';
  if (transactionId) {
    path += `/${transactionId}`;
  } else if (referenceId) {
    path += `?referenceID=${referenceId}`;
  }
  const url = getUrl(path, type);
  let response;
  try {
    response = await getAgent().get(url);
    const parsed: TabapayRetrieveTransactionResponse = JSON.parse(response.text);
    response = formatFetchTransactionResponse(parsed, options, { isAchTransaction });
  } catch (error) {
    logger.error('PaymentGateway: failed fetching Tabapay transaction', {
      message: error.message,
      stack: error.stack,
      responseBody: error?.response?.body,
      statusCode: error?.response?.code,
      options,
    });
    response = formatFetchTransactionError(error, options, { isAchTransaction });
  }

  return response;
}

function fetchTransaction(options: FetchTransactionOptions): Promise<PaymentProviderTransaction> {
  return fetchTabapayTransaction(options, false);
}

function reverseTransaction(
  options: ReverseTransactionOptions,
): Promise<PaymentProviderTransaction> {
  return reverseTabapayTransaction(options, false);
}

const tabapayApiInterface: IPaymentGateway = {
  fetchTransaction,
  createTransaction,
  reverseTransaction,
};

export default tabapayApiInterface;
