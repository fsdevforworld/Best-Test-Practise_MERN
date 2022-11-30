import { Op } from 'sequelize';
import { get, isEmpty, isNil, pick } from 'lodash';
import { Moment, moment } from '@dave-inc/time-lib';
import { StatusCodeError, ClientError, ServerError } from '@dave-inc/error-types';
import {
  AVSMatchResult,
  TabaGooglePayParam,
  TabapayAccountOwnerFullAddressParam,
  TabapayAccountOwnerParam,
  TabapayAccountParam,
  TabapayApplePayParam,
  TabapayAVSResponse,
  TabapayContext,
  TabapayCreateTransactionRequest,
  TabapayCreateTransactionResponse,
  TabapayIdType,
  TabapayRequestTransactionStatus,
  TabapayRequestTransactionType,
  TabapayRetrieveAccountResponse,
  CodeAVSResult,
  CodeSecurityCodeResult,
} from '@dave-inc/loomis-client';
import * as request from 'superagent';
import { BigNumber } from 'bignumber.js';
import * as PhoneNumber from 'google-libphonenumber';
import { AuditLog, AVSLog, TabapayKey, User } from '../models';
import {
  BaseApiError,
  CUSTOM_ERROR_CODES,
  InvalidParametersError,
  PaymentError,
  PaymentProcessorError,
} from './error';
import logger from './logger';
import * as forge from 'node-forge';
import * as md5 from 'md5';

import { isDevEnv, urlSafeBase64Decode } from './utils';
import {
  ExternalDisbursement,
  ExternalMobilePayment,
  ISuperAgentAgent,
  PaymentMethodRetrieval,
  PaymentMethodVerification,
} from '../typings';
import * as config from 'config';
import { dogstatsd } from './datadog-statsd';
import { InvalidParametersMessageKey } from '../translations';
import { ExternalTransactionProcessor, ExternalTransactionStatus } from '@dave-inc/wire-typings';

(forge as any).options.usePureJavaScript = true;

// https://developers.tabapay.com/
// click references -> network response codes
export const TABAPAY_RESPONSE_CODES = {
  doNotHonor: '05',
  inoperative: '91',
  systemMalfunction: '96',
  mastercardNotApprovedResponseCodes: [
    '3C5E5622',
    'ZX', // not in their documentation
  ],
  cardNumberInvalid: '3C3E5261',
};

export type TabapayAPIError = {
  EC: string;
  SC: number;
  EM: string;
  networkRC: string;
};

export enum TabapayErrorEC {
  CorrespondingID = '3C5E501C',
}

export enum TabapayErrorEM {
  CorrespondingID = 'correspondingID',
}

export enum TabapayErrorSC {
  OK = 200,
  Created = 201,
  MultiStatus = 207,
  BadRequest = 400,
  UnAuthorized = 401,
  Forbidden = 403,
  NotFound = 404,
  MethodNotAllowed = 405,
  NotAcceptable = 406,
  Conflict = 406,
  Gone = 410,
  UnsupportedMediaType = 415,
  UnprocessableEntity = 422,
  Locked = 423,
  TooManyRequests = 429,
  RequestHeaderFieldsTooLarge = 431,
  ServerError = 500,
  BadGateway = 502,
  ServiceUnavailable = 503,
  GatewayTimeout = 504,
}

export const invalidResponseCodes = [
  '04',
  '07',
  '14',
  '15',
  '33',
  '34',
  '35',
  '36',
  '37',
  '38',
  '41',
  '43',
  '54',
  '56',
  '59',
  '67',
  'SD',
  'SG',
  'T3',
  'T4',
  '101',
  '201',
  '102',
  '202',
  '111',
  '118',
  '129',
  '208',
  '209',
  '210',
];

export function isNetworkRC(maybeRC: string): boolean {
  // Network response codes is either 2-character letter + number
  // combination or a 3 digit number
  return /^(\w{2}|\d{3})$/.test(maybeRC);
}

const phoneUtil = PhoneNumber.PhoneNumberUtil.getInstance();

export const TABAPAY_URL: string = config.get('tabapay.url');
export const TABAPAY_CLIENT_ID: string = config.get('tabapay.clientId');
export const TABAPAY_ADVANCE_SUB_ID: string = config.get('tabapay.advanceSubId');
export const TABAPAY_SETTLEMENT_ACCOUNT_ID: string = config.get('tabapay.settlementAccount');
const TABAPAY_TOKEN: string = config.get('tabapay.token');
const TABAPAY_SUBSCRIPTION_SUB_ID: string = config.get('tabapay.subscriptionSubId');
const TABAPAY_BANK_FUNDING_SUB_ID: string = config.get('tabapay.bankFundingSubId');

export const BASE_URL = `https://${TABAPAY_URL}/v1/clients/${TABAPAY_CLIENT_ID}`;

export const agent = (request.agent() as ISuperAgentAgent<request.SuperAgentRequest>).set(
  'Authorization',
  `Bearer ${TABAPAY_TOKEN}`,
);

function localAgentLogger(req: request.Request) {
  if (isDevEnv()) {
    req.on('response', (res: request.Response) => {
      logger.error('error sending request to the tabapay sandbox', { ex: res });
    });
  }
}

type TabapayFormattedUser = {
  name: {
    first: string;
    last: string;
  };
  address: {
    line1?: string;
    line2?: string;
    city?: string;
    state?: string;
    zipcode: string;
  };
  phone: {
    number: string;
    countryCode: string;
  };
};

function formatKey(tabapayKey: string): string {
  return `-----BEGIN PUBLIC KEY-----
${urlSafeBase64Decode(tabapayKey).toString('base64')}
-----END PUBLIC KEY-----`;
}

/*
 * N.B. this function should never actually be used from within the API.
 * It is copied (without types) into the mobile app, where it will be used in production.
 * The reason it's here is to make testing / encrypting cards manually simpler.
 */
export function encrypt(
  cardNumber: string,
  expiration: Moment,
  securityCode: string,
  key: string,
): { encrypted: string; referenceId: string } {
  const formattedCard = `${cardNumber}|${expiration.format('YYYYMM')}|${securityCode}`;
  const rsaKey = forge.pki.publicKeyFromPem(key) as forge.pki.rsa.PublicKey;
  const encrypted = rsaKey.encrypt(formattedCard, 'RSA-OAEP', {
    md: forge.md.sha256.create(),
  });

  const urlSafe = forge.util
    .encode64(encrypted)
    .replace(/\+/g, '-') // Convert '+' to '-'
    .replace(/\//g, '_') // Convert '/' to '_'
    .replace(/=+$/, ''); // Remove ending '='

  return {
    encrypted: urlSafe,
    referenceId: md5(cardNumber).substr(0, 15),
  };
}

async function createKey(): Promise<TabapayKey> {
  const url = `${BASE_URL}/keys`;

  const response = await agent
    .post(url)
    .send({ format: 'ASN.1', expiration: 365 })
    .use(localAgentLogger);

  const result = JSON.parse(response.text);

  return TabapayKey.create({
    expiration: moment(result.expiration, 'YYYY-MM-DDTHH:mm:ssZ'),
    keyId: result.keyID,
    key: formatKey(result.key),
  });
}

export async function getKey(): Promise<TabapayKey> {
  const key = await TabapayKey.findOne({
    where: {
      expiration: { [Op.gt]: moment().add(1, 'hour') },
    },
    order: [['expiration', 'DESC']],
  });

  if (key) {
    return key;
  } else {
    return createKey();
  }
}

export async function verifyCard(
  encryptedCard: string,
  keyId: string,
  owner: TabapayAccountOwnerParam,
  user?: User,
): Promise<PaymentMethodVerification> {
  //EXPERIMENT: AVS? if we're gonna do AVS, we have to throw an InvalidParametersError based on the result
  let url = `${BASE_URL}/cards`;

  let shouldUseAVS = false;

  const ownerAddress = get(owner, 'address.zipcode');

  const doesNotHaveDummyAddress =
    Boolean(ownerAddress) && owner.address.zipcode !== dummyOwnerAddress.zipcode;

  if (user && doesNotHaveDummyAddress) {
    shouldUseAVS = true;
  }

  // bypass AVS for those few users who got into the experiment group
  // before it checked for the dummy address
  if (shouldUseAVS && doesNotHaveDummyAddress) {
    url = `${BASE_URL}_${TABAPAY_ADVANCE_SUB_ID}/cards?AVS`;
  }

  const card = {
    data: encryptedCard,
    keyID: keyId,
  };
  const result = await fetchCardVerification({ url, owner, card, user });

  if (!result.card.pull.enabled || !result.card.push.enabled) {
    throw new InvalidParametersError('This card does not support instant transfers', {
      customCode: CUSTOM_ERROR_CODES.PAYMENT_METHOD_UNSUPPORTED_INSTANT_TRANSFER,
    });
  } else if (result.card.push.type !== 'PrePaid' && result.card.push.type !== 'Debit') {
    throw new InvalidParametersError(InvalidParametersMessageKey.UnsupportedCardType, {
      customCode: CUSTOM_ERROR_CODES.PAYMENT_METHOD_UNSUPPORTED_TYPE,
      interpolations: { cardType: result.card.push.type },
    });
  }

  const { AVS } = result;

  let avsLogId = undefined;

  const isDaveBankingUser = await user?.hasDaveBanking();

  if (!isDaveBankingUser && AVS && user) {
    avsLogId = await handleAVSResult(AVS, user);
  }

  return {
    network: result.card.push.network.toLowerCase(),
    type: result.card.push.type.toLowerCase(),
    availability: result.card.push.availability.toLowerCase(),
    avsLogId,
  };
}

export async function handleAVSResult(AVS: TabapayAVSResponse, user: User): Promise<number> {
  const avsResultMatch: AVSMatchResult = {
    addressMatch:
      AVS.codeAVS === CodeAVSResult.AddressMatch ||
      AVS.codeAVS === CodeAVSResult.ZipAndAddressMatch,
    cvvMatch: AVS.codeSecurityCode === CodeSecurityCodeResult.CVVMatch,
    zipMatch:
      AVS.codeAVS === CodeAVSResult.ZipMatch || AVS.codeAVS === CodeAVSResult.ZipAndAddressMatch,
  };

  const { id: userId } = user;

  const avsLog = await AVSLog.create({
    userId,
    addressMatch: avsResultMatch.addressMatch,
    cvvMatch: avsResultMatch.cvvMatch,
    zipMatch: avsResultMatch.zipMatch,
  });

  return avsLog.id;
}
async function fetchCardVerification({
  url,
  owner,
  card,
  user,
}: {
  url: string;
  owner: TabapayAccountOwnerParam;
  card: any;
  user?: User;
}) {
  const body = {
    owner,
    card,
  };

  let response: request.Response;
  try {
    response = await agent
      .post(url)
      .send(body)
      .use(localAgentLogger);
  } catch (error) {
    const tabapayError: TabapayAPIError = parseTabapayError(error);

    if (tabapayError && Boolean(user)) {
      await handleTabapayAPIError(tabapayError, { userId: user?.id });
    }

    if (error.status === 400) {
      // Tabapay sends "BadRequest" for simply invalid card numbers.
      throw new InvalidParametersError('Please check that you entered the correct card number', {
        customCode: CUSTOM_ERROR_CODES.PAYMENT_METHOD_INVALID_CARD_NUMBER,
      });
    }
    throw error;
  }

  return JSON.parse(response.text);
}

export async function createAccount({
  referenceId,
  encryptedCard,
  keyId,
  owner,
  allowDuplicate = false,
}: {
  referenceId: string;
  encryptedCard: string;
  keyId: string;
  owner: TabapayFormattedUser;
  allowDuplicate?: boolean;
}): Promise<string> {
  const url = `${BASE_URL}/accounts`;
  const queryParams = allowDuplicate ? 'OKToAddDuplicateCard' : 'RejectDuplicateCard';
  const response = await agent
    .post(`${url}?${queryParams}`)
    .send({
      referenceID: referenceId,
      card: {
        data: encryptedCard,
        keyID: keyId,
      },
      owner,
    })
    .use(localAgentLogger);
  const result = JSON.parse(response.text);
  return result.accountID;
}

// Satisfies Tabapay's requirement of debit cards having addresses.
//
// Users add debit cards in our flow before they have a chance to add
// their addresses, so this should satisfy that requirement for now.
//
// TODO: Remove this when Tabapay no longer requires addresses.
export const dummyOwnerAddress: TabapayAccountOwnerFullAddressParam = {
  line1: '123 Main St',
  line2: 'Apt 456',
  city: 'Livengood',
  state: 'AK',
  zipcode: '00000',
};

export function formatOwner(user: User): TabapayFormattedUser {
  const phoneNumber = phoneUtil.parse(user.phoneNumber, 'E164');

  let address: TabapayAccountOwnerFullAddressParam = {
    line1: user.addressLine1,
    line2: user.addressLine2,
    city: user.city,
    // Forcing uppercase as a quick fix since the state case is inconsistent.
    // TODO: Implement a more long-term solution: https://www.pivotaltracker.com/story/show/164611032
    state: user.state ? user.state.toUpperCase() : null,
    zipcode: user.zipCode,
  };
  if (!address.line1 || !address.city || !address.state || !address.zipcode) {
    address = dummyOwnerAddress;
  }

  return {
    name: {
      first: user.firstName,
      last: user.lastName,
    },
    address,
    phone: {
      number: phoneNumber.getNationalNumber().toString(),
      countryCode: phoneNumber.getCountryCode().toString(),
    },
  };
}

export async function removeCard(accountId: string): Promise<void> {
  const url = `${BASE_URL}_${TABAPAY_ADVANCE_SUB_ID}/accounts/${accountId}`;
  await agent.delete(url);
}

export async function disburse(
  referenceId: string,
  userTabapayId: string,
  amount: number,
  bin?: string,
): Promise<ExternalDisbursement> {
  const requestData = {
    referenceID: referenceId,
    type: TabapayRequestTransactionType.Push,
    amount,
    accounts: {
      sourceAccountID: TABAPAY_SETTLEMENT_ACCOUNT_ID,
      destinationAccountID: userTabapayId,
    },
  };

  const transaction = await createTransaction({
    requestData,
    bin,
    isSubscription: false,
    userTabapayId,
  });

  const disbursement = formatDisbursement(transaction);

  return disbursement;
}

function formatDisbursement(response: TabapayCreateTransactionResponse): ExternalDisbursement {
  const disbursementStatusMap = {
    [TabapayRequestTransactionStatus.Created]: ExternalTransactionStatus.Pending,
    [TabapayRequestTransactionStatus.Pending]: ExternalTransactionStatus.Pending,
    [TabapayRequestTransactionStatus.Unknown]: ExternalTransactionStatus.Pending,
    [TabapayRequestTransactionStatus.Completed]: ExternalTransactionStatus.Completed,
    [TabapayRequestTransactionStatus.Failed]: ExternalTransactionStatus.NotDisbursed,
    [TabapayRequestTransactionStatus.Error]: ExternalTransactionStatus.NotDisbursed,
    [TabapayRequestTransactionStatus.Reversed]: ExternalTransactionStatus.Returned,
    [TabapayRequestTransactionStatus.ReversalAttempted]: ExternalTransactionStatus.Unknown,
    [TabapayRequestTransactionStatus.Locked]: ExternalTransactionStatus.Unknown,
    [TabapayRequestTransactionStatus.Deleted]: ExternalTransactionStatus.Canceled,
  };

  const status = disbursementStatusMap[response.status];

  if (status === ExternalTransactionStatus.NotDisbursed) {
    throw new PaymentError('Failed to process disbursement', { data: response });
  }

  const {
    approvalCode,
    network: settlementNetwork,
    networkID: networkId,
    transactionID: id,
  } = response;

  return {
    id,
    network: { approvalCode, networkId, settlementNetwork },
    processor: ExternalTransactionProcessor.Tabapay,
    status,
  };
}

export async function createMobileTransaction({
  referenceId,
  sourceAccount,
  amount,
  feeIncluded,
  sourceAccountID,
}: {
  referenceId: string;
  sourceAccount?: TabapayAccountParam;
  amount: number;
  feeIncluded?: boolean;
  sourceAccountID?: string;
}): Promise<ExternalMobilePayment> {
  const accounts = {
    sourceAccount,
    sourceAccountID,
    destinationAccountID: TABAPAY_SETTLEMENT_ACCOUNT_ID,
  };
  const requestData: TabapayCreateTransactionRequest = {
    referenceID: referenceId,
    type: TabapayRequestTransactionType.Pull,
    accounts,
    amount,
    memo: feeIncluded ? 'feeIncluded' : undefined,
  };
  const response = await createTransaction({ requestData, isMobileTransaction: true });
  logger.info('Created Mobile transaction', { response });

  let transactionStatus: ExternalTransactionStatus;
  switch (response.status) {
    case TabapayRequestTransactionStatus.Completed:
      transactionStatus = ExternalTransactionStatus.Completed;
      break;
    case TabapayRequestTransactionStatus.Failed:
    case TabapayRequestTransactionStatus.Error:
      transactionStatus = ExternalTransactionStatus.Canceled;
      break;
    default:
      transactionStatus = ExternalTransactionStatus.Pending;
      break;
  }
  return {
    transactionId: response.transactionID,
    status: transactionStatus,
    isAVSMatch: response.AVS ? response.AVS.codeAVS === 'Y' : false,
  };
}

export async function retrieve(
  referenceId: string,
  sourceAccount: string | TabapayAccountParam,
  amount: number,
  isSubscription: boolean = false,
  bin?: string,
  correspondingPushId?: string,
) {
  let accounts;

  if (typeof sourceAccount === 'string') {
    accounts = {
      sourceAccountID: sourceAccount,
      destinationAccountID: TABAPAY_SETTLEMENT_ACCOUNT_ID,
    };
  } else {
    accounts = {
      sourceAccount,
      destinationAccountID: TABAPAY_SETTLEMENT_ACCOUNT_ID,
    };
  }

  const requestData: TabapayCreateTransactionRequest = {
    referenceID: referenceId,
    type: TabapayRequestTransactionType.Pull,
    accounts,
    amount,
    correspondingID: correspondingPushId,
    pullOptions: {
      quasiCash: !isSubscription,
      recurring: false, // Disabled for now (until we re-register account ids. This was requested by Mastercard) --> isSubscription,
    },
  };

  const transaction = await createTransaction({ requestData, bin, isSubscription });

  const payment = formatPayment(transaction);

  return payment;
}

export function formatPayment(
  transaction: TabapayCreateTransactionResponse,
): PaymentMethodRetrieval {
  if (transaction.status === TabapayRequestTransactionStatus.Error) {
    throw new PaymentError('Failed to process payment', { data: transaction });
  }

  const paymentStatusMap = {
    [TabapayRequestTransactionStatus.Created]: ExternalTransactionStatus.Pending,
    [TabapayRequestTransactionStatus.Pending]: ExternalTransactionStatus.Pending,
    [TabapayRequestTransactionStatus.Unknown]: ExternalTransactionStatus.Pending,
    [TabapayRequestTransactionStatus.Completed]: ExternalTransactionStatus.Completed,
    [TabapayRequestTransactionStatus.Reversed]: ExternalTransactionStatus.Returned,
    [TabapayRequestTransactionStatus.ReversalAttempted]: ExternalTransactionStatus.Unknown,
    [TabapayRequestTransactionStatus.Locked]: ExternalTransactionStatus.Unknown,
    [TabapayRequestTransactionStatus.Deleted]: ExternalTransactionStatus.Canceled,
    [TabapayRequestTransactionStatus.Failed]: ExternalTransactionStatus.Canceled,
    [TabapayRequestTransactionStatus.Error]: ExternalTransactionStatus.Canceled,
  };

  const { transactionID: id } = transaction;
  const status = paymentStatusMap[transaction.status];

  return {
    id,
    status,
  };
}

export async function cancel(id: string, isBankFunding?: boolean): Promise<void> {
  let subClientId = TABAPAY_ADVANCE_SUB_ID;
  if (isBankFunding) {
    subClientId = TABAPAY_BANK_FUNDING_SUB_ID;
  }
  const url = `${BASE_URL}_${subClientId}/transactions/${id}?reversal`;

  const response = await agent.delete(url).then(res => JSON.parse(res.text));

  if (response.status === 'ERROR') {
    throw new PaymentProcessorError('Could not reverse transaction', response.reversal, {
      data: {
        ...response,
        processor: ExternalTransactionProcessor.Tabapay,
        processorHttpStatus: response.status,
        gateway: ExternalTransactionProcessor.Tabapay,
      },
    });
  }

  return response;
}

export async function createTransaction(requestContext: Partial<TabapayContext>) {
  const { requestData, isSubscription, isMobileTransaction } = requestContext;

  let subClientId = TABAPAY_ADVANCE_SUB_ID;
  if (isSubscription) {
    subClientId = TABAPAY_SUBSCRIPTION_SUB_ID;
  } else if (isMobileTransaction) {
    subClientId = TABAPAY_BANK_FUNDING_SUB_ID;
  }

  const url = `${BASE_URL}_${subClientId}/transactions`;
  const serializedData = Object.assign({}, requestData, {
    amount: new BigNumber(requestData.amount).toFixed(2),
  });

  return agent
    .post(url)
    .retry(2, err => {
      if (err?.timeout || err?.errno === 'ETIMEDOUT') {
        return true;
      }
      return false;
    })
    .send(serializedData)
    .use(localAgentLogger)
    .then(res => {
      const response = JSON.parse(res.text) as TabapayCreateTransactionResponse;

      // tabapay returns 200 but passes back the error from api calls it made
      if (response.status === TabapayRequestTransactionStatus.Error) {
        handleTransactionStatusError(requestData, response, res.status, { isSubscription });
      }
      dogstatsd.increment('tabapay.create_transaction_amount', Number(requestData.amount * 100), [
        `transactionType:${requestData.type}`,
        `is_subscription:${isSubscription}`,
      ]);
      return response;
    })
    .catch(async error => {
      const tabapayError: TabapayAPIError = parseTabapayError(error);

      if (tabapayError) {
        const isCorrespondingIdError =
          tabapayError.SC === TabapayErrorSC.BadRequest &&
          (tabapayError.EC === TabapayErrorEC.CorrespondingID ||
            tabapayError.EM === TabapayErrorEM.CorrespondingID);

        const isUnprocessableEntityError = tabapayError.SC === TabapayErrorSC.UnprocessableEntity;

        if (isCorrespondingIdError || isUnprocessableEntityError) {
          return await handleTabapayAPIError(tabapayError, requestContext);
        }
      }

      throw error;
    });
}

export async function fetchAccount(
  id: string,
  idType: TabapayIdType = TabapayIdType.Id,
  useSubClientId: boolean = false,
): Promise<TabapayRetrieveAccountResponse> {
  let url;
  // Some old accounts were created using the sub id for advance and must be
  // fetched that way.
  const subClientIdString = `_${TABAPAY_ADVANCE_SUB_ID}`;
  const base = `${BASE_URL}${useSubClientId ? subClientIdString : ''}`;

  if (idType === TabapayIdType.Id) {
    url = `${base}/accounts/${id}`;
  } else if (idType === TabapayIdType.ReferenceId) {
    url = `${base}/accounts?referenceID=${id}`;
  }

  try {
    return await agent.get(url).then(res => JSON.parse(res.text));
  } catch (error) {
    if (get(error, 'response.text')) {
      // If we get a not found tabapay error, retry with the sub client id
      // TODO remove this if tabapay moves accounts to client level
      const tabapayError: TabapayAPIError = JSON.parse(error.response.text);
      if (tabapayError.SC === TabapayErrorSC.NotFound && !useSubClientId) {
        return fetchAccount(id, idType, true);
      }
    }
    throw error;
  }
}

async function handleInvalidCardNumber(
  tabapayError: TabapayAPIError,
  userId: number | undefined,
): Promise<void> {
  dogstatsd.increment('tabapay.api_error', 1, { tabapayEC: tabapayError.EC });

  if (userId) {
    await AuditLog.create({
      userId,
      message: tabapayError.EM,
      type: 'TABAPAY_VERIFY_CARD',
      extra: {
        data: {
          ...tabapayError,
          customCode: CUSTOM_ERROR_CODES.PAYMENT_METHOD_INVALID_CARD_NUMBER,
        },
      },
    });
  }
}

function handleUnprocessableEntity(
  tabapayError: TabapayAPIError,
  bin: string,
  userTabapayId: string,
): never {
  if (bin && userTabapayId) {
    dogstatsd.increment('tabapay.unprocessable_entity_error', { binFirstTwo: bin.slice(0, 2) });

    logger.error(`tabapay unprocessable entity error for bin ${bin}`, {
      bin,
      userTabapayId,
      ex: tabapayError,
    });
  }

  throw new PaymentProcessorError(
    'Our payment processor encountered an error with this card. Please try a different card until we resolve this issue with the payment provider',
    tabapayError.networkRC,
  );
}

async function handleBadCorrespondingId(
  tabapayError: TabapayAPIError,
  requestData: TabapayCreateTransactionRequest,
  bin: string,
  wasRetried: boolean,
  isSubscription: boolean,
): Promise<any> {
  dogstatsd.increment('tabapay.bad_corresponding_id');

  if (!wasRetried) {
    delete requestData.correspondingID;

    return await createTransaction({ requestData, bin, isSubscription, wasRetried: true });
  }
}

function handleInvalidParameters(tabapayError: TabapayAPIError): never {
  let customCode: number = null;

  if (tabapayError.networkRC === TABAPAY_RESPONSE_CODES.doNotHonor) {
    dogstatsd.increment('tabapay.do_not_honor_error');
    customCode = CUSTOM_ERROR_CODES.PROVIDER_DENIAL;
  }

  const statusCode = tabapayError.SC as StatusCodeError;
  if (statusCode >= 400 && statusCode < 500) {
    throw new InvalidParametersError('Please check that you entered the correct card number', {
      customCode,
      data: tabapayError,
      statusCode: statusCode as ClientError,
    });
  } else {
    throw new BaseApiError('Please check that you entered the correct card number', {
      customCode,
      data: tabapayError,
      statusCode: statusCode as ServerError,
    });
  }
}

async function handleTabapayAPIError(
  tabapayError: TabapayAPIError,
  { bin, requestData, isSubscription, userId, userTabapayId, wasRetried }: TabapayContext,
): Promise<any> {
  if (tabapayError.EC === TABAPAY_RESPONSE_CODES.cardNumberInvalid) {
    return handleInvalidCardNumber(tabapayError, userId);
  } else if (tabapayError.SC === TabapayErrorSC.UnprocessableEntity) {
    return handleUnprocessableEntity(tabapayError, bin, userTabapayId);
  } else if (
    tabapayError.SC === TabapayErrorSC.BadRequest &&
    (tabapayError.EC === TabapayErrorEC.CorrespondingID ||
      tabapayError.EM === TabapayErrorEM.CorrespondingID) // sometimes only the EM will indicate a bad corresponding ID
  ) {
    return handleBadCorrespondingId(tabapayError, requestData, bin, wasRetried, isSubscription);
  } else {
    return handleInvalidParameters(tabapayError);
  }
}

function handleTransactionStatusError(
  requestData: TabapayCreateTransactionRequest,
  responseData: TabapayCreateTransactionResponse,
  httpStatus: number,
  { isSubscription }: Partial<TabapayContext> = {},
) {
  dogstatsd.increment('tabapay.transaction_processing_error', 1, [
    `network:${responseData.network}`,
    `network_rc:${responseData.networkRC}`,
    `request_type:${requestData.type}`,
    `is_subscription:${isSubscription}`,
  ]);
  throw new PaymentProcessorError(
    'Card entry declined. Please check that your debit card information is correct and try again.',
    responseData.networkRC,
    {
      data: {
        ...responseData,
        processorHttpStatus: httpStatus,
        gateway: ExternalTransactionProcessor.Tabapay,
        isSubscription,
      },
      customCode: CUSTOM_ERROR_CODES.BANK_DENIED_CARD,
    },
  );
}

function parseTabapayError(error: any): TabapayAPIError | null {
  let tabapayError: TabapayAPIError;

  if (error?.response?.text && error?.message !== 'Not Acceptable') {
    try {
      tabapayError = JSON.parse(error.response.text);
    } catch (_jsonParseError) {
      dogstatsd.increment('tabapay.create_transaction.json_parse_error');

      throw new BaseApiError('Error parsing tabapay error json', { data: { error } });
    }

    return tabapayError;
  } else if (error?.message === 'Not Acceptable') {
    throw new PaymentProcessorError(
      'Our payment processor encountered an error with this card. Please try again or try with another card.',
      error.message,
      {
        data: {
          processor: ExternalTransactionProcessor.Tabapay,
          processorHttpStatus: error.status,
          gateway: ExternalTransactionProcessor.Tabapay,
        },
      },
    );
  }

  return null;
}

export type TabapayQueryCardResponse = {
  SC: number;
  EC: string;
  EM?: string;
  card: {
    pull: {
      enabled: boolean;
      network?: string;
      type?: string;
      regulated?: string;
      currency?: string;
      country?: string;
    };
    push: {
      enabled: boolean;
      network?: string;
      type?: string;
      regulated?: string;
      currency?: string;
      country?: string;
      availability?: string;
    };
  };
  AVS?: {
    networkRC?: string;
    authorizeID?: string;
    resultText?: string;
    codeAVS?: string;
    codeSecurityCode?: string;
    EC?: string;
  };
  fees?: {
    pull?: {
      interchange: string;
      network: string;
      tabapay: string;
    };
    push?: {
      interchange: string;
      network: string;
      tabapay: string;
    };
  };
};

type CardQueryCardParam = {
  card: { device: TabaGooglePayParam } | { mobilePay: TabapayApplePayParam };
};
type CardQueryAccountParam = {
  account: {
    accountID: string;
    securityCode?: string;
  };
};

export type TabapayCardQueryOptions = (CardQueryCardParam | CardQueryAccountParam) & {
  owner: TabapayAccountOwnerParam;
  amount: string;
};

export async function queryCard(
  payload: TabapayCardQueryOptions,
): Promise<TabapayQueryCardResponse> {
  const url = `${BASE_URL}_${TABAPAY_BANK_FUNDING_SUB_ID}/cards`;
  try {
    const res = await agent
      .post(url)
      .query('AVS')
      .send(payload);

    const response: TabapayQueryCardResponse = JSON.parse(res.text);
    return response;
  } catch (error) {
    const errorPayload =
      error?.response?.error instanceof Error ? error.response.error : error?.response;

    logger.error('PaymentGateway: failed querying Tabapay card', {
      error: errorPayload,
      response: error.response,
      payload,
    });
    dogstatsd.increment('tabapay.avs_check.exception');
    throw error;
  }
}

// TODO nonEnglishInAddress is temporary, remove it once we confirm it's the only issue with Tabapay's AVS check
export function shouldCreateMobileTransaction(res: TabapayQueryCardResponse): boolean {
  const validNetworkRC = !isNil(res.AVS?.networkRC?.match(/^(0|00|000|085|85)$/));
  const invalidAVSCode = !isNil(res.AVS?.codeAVS?.match(/^(N|U|R)$/));
  const missingAVSCode = isNil(res.AVS?.codeAVS) || isEmpty(res.AVS?.codeAVS);
  const isSuccess = res.SC === 200;

  if (!isSuccess) {
    logger.info('AVS check returned unsuccessful status code', pick(res, ['SC', 'AVS']));
    dogstatsd.increment('tabapay.avs_check.error', { status: res.SC.toString() });
    return false;
  }

  if (!validNetworkRC || invalidAVSCode || missingAVSCode) {
    dogstatsd.increment('tabapay.avs_check.failed', {
      resultCode: res.AVS?.networkRC,
      avsCode: res.AVS?.codeAVS,
    });
    return false;
  }

  dogstatsd.increment('tabapay.avs_check.success');
  return true;
}
