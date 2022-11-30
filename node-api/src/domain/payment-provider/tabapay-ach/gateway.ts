import * as config from 'config';
import { get as _get, isNil as _isNil } from 'lodash';
import {
  IPaymentGateway,
  PaymentProviderTransactionType,
  CreateTransactionOptions,
  FetchTransactionOptions,
  PaymentProviderTransaction,
  TabapayCreateTransactionResponse,
  ReverseTransactionOptions,
} from '@dave-inc/loomis-client';
import { BankAccountSubtype } from '@dave-inc/wire-typings';
import { InvalidParametersError } from '../../../lib/error';
import logger from '../../../lib/logger';
import gcloudKms from '../../../lib/gcloud-kms';
import { BankAccount } from '../../../models';
import {
  formatCreateTransactionError,
  formatCreateTransactionResponse,
} from '../tabapay/serializer';
import {
  getAgent,
  getUrl,
  formatType,
  fetchTabapayTransaction,
  reverseTabapayTransaction,
} from '../tabapay/gateway';

const { settlementAccount: SETTLEMENT_ACCOUNT } = config.get('tabapay');

const TabapayChecking = 'C';

function mapAccountType(subtype: BankAccountSubtype) {
  switch (subtype) {
    case BankAccountSubtype.Checking:
      return TabapayChecking;
    default:
      throw new InvalidParametersError(`Not a supported bank account type: ${subtype}`);
  }
}

function formatAccounts(
  type: PaymentProviderTransactionType,
  bank: { accountNumber: string; routingNumber: string; accountType: string },
) {
  switch (type) {
    case PaymentProviderTransactionType.AdvanceDisbursement:
      return {
        sourceAccountID: SETTLEMENT_ACCOUNT,
        destinationAccount: { bank },
      };
    case PaymentProviderTransactionType.SubscriptionPayment:
    case PaymentProviderTransactionType.AdvancePayment:
      return {
        sourceAccount: { bank },
        destinationAccountID: SETTLEMENT_ACCOUNT,
      };
    default:
      throw new InvalidParametersError(`type: ${type} is not valid`);
  }
}

async function createTransaction(options: CreateTransactionOptions) {
  logger.info('PaymentGateway: creating Tabapay ACH transaction', options);

  const { referenceId: referenceID, type, amount, sourceId } = options;
  const url = getUrl('/transactions', type);

  const bankAccount = await BankAccount.findByPk(sourceId);
  if (_isNil(bankAccount)) {
    throw new InvalidParametersError('Missing valid bank account id');
  }

  const accountRoutingString = await gcloudKms.decrypt(bankAccount.accountNumberAes256);
  const [accountNumber, routingNumber] = accountRoutingString.split('|');
  const accountType = mapAccountType(bankAccount.subtype);

  const payload = {
    referenceID,
    type: formatType(type),
    accounts: formatAccounts(type, { accountNumber, routingNumber, accountType }),
    amount: amount.toFixed(2),
    achOptions: 'N', // next day transfer
  };

  let response;
  try {
    const res = await getAgent()
      .post(url)
      .send(payload);
    const parsed: TabapayCreateTransactionResponse = JSON.parse(res.text);
    response = formatCreateTransactionResponse(parsed, options, { isAchTransaction: true });
  } catch (error) {
    logger.error('PaymentGateway: failed creating Tabapay transaction', { error, options });
    response = formatCreateTransactionError(error, options, { isAchTransaction: true });
  }

  return response;
}

async function fetchTransaction(
  options: FetchTransactionOptions,
): Promise<PaymentProviderTransaction> {
  return fetchTabapayTransaction(options, true);
}

async function reverseTransaction(
  options: ReverseTransactionOptions,
): Promise<PaymentProviderTransaction> {
  return reverseTabapayTransaction(options, true);
}

const tabapayAchApiInterface: IPaymentGateway = {
  fetchTransaction,
  createTransaction,
  reverseTransaction,
};

export default tabapayAchApiInterface;
