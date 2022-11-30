import { getPaymentGateway as getGateway } from '@dave-inc/loomis-client';
import { BankingDataSource } from '@dave-inc/wire-typings';
import loomisClient from '@dave-inc/loomis-client';

import { dogstatsd } from '../../lib/datadog-statsd';
import { AuditLog, BankAccount, BankConnection, SubscriptionPayment } from '../../models';
import logger from '../../lib/logger';
import { PaymentProviderGatewayParams } from '../payment';
import {
  PaymentGateway,
  PaymentProcessor,
  PaymentProviderTransaction,
  PaymentProviderTransactionStatus,
  PaymentProviderTransactionType,
} from '../../typings';
import { buildFetchRequest } from './build-request';
import { parseLoomisGetPaymentMethod } from '../../services/loomis-api/helper';

const gatewayToProcessor = {
  [PaymentGateway.Synapsepay]: PaymentProcessor.Synapsepay,
  [PaymentGateway.Tabapay]: PaymentProcessor.Tabapay,
  [PaymentGateway.TabapayACH]: PaymentProcessor.Tabapay,
  [PaymentGateway.BankOfDave]: PaymentProcessor.BankOfDave,
  [PaymentGateway.Risepay]: PaymentProcessor.Tabapay, // Added so it can correctly type check
  [PaymentGateway.Stripe]: PaymentProcessor.Stripe,
};

const SuccessfulResponseStatuses = [
  PaymentProviderTransactionStatus.Canceled,
  PaymentProviderTransactionStatus.Completed,
  PaymentProviderTransactionStatus.Pending,
  PaymentProviderTransactionStatus.Failed,
  PaymentProviderTransactionStatus.Returned,
];

export async function fetchSubscriptionPayment(
  subscriptionPayment: SubscriptionPayment,
): Promise<PaymentProviderTransaction> {
  let externalTransaction: PaymentProviderTransaction;

  const paymentGateways: PaymentGateway[] = await determinePaymentGatewaysToCheck(
    subscriptionPayment,
  );

  // TODO: Risepay is no longer being used
  const isNotCurrentlySupported = paymentGateways.includes(PaymentGateway.Risepay);
  if (isNotCurrentlySupported) {
    return;
  }

  const failedExternalTransactionResponses = [];

  let gatewayName: PaymentGateway;
  for (gatewayName of paymentGateways) {
    const requestOptions = await buildFetchRequest(
      subscriptionPayment,
      gatewayToProcessor[gatewayName],
      PaymentProviderTransactionType.SubscriptionPayment,
    );

    const gateway = getGateway(gatewayName);
    externalTransaction = await gateway.fetchTransaction(requestOptions);

    const isSuccessfulResponseStatus = SuccessfulResponseStatuses.includes(
      externalTransaction?.status,
    );

    if (isSuccessfulResponseStatus) {
      break;
    }

    if (externalTransaction?.status !== PaymentProviderTransactionStatus.NotFound) {
      failedExternalTransactionResponses.push(externalTransaction);
    }
  }

  if (failedExternalTransactionResponses.length) {
    dogstatsd.increment('update_subscription_payment_status.fetch_error');

    await AuditLog.create({
      userId: subscriptionPayment.userId,
      type: 'UPDATE_SUBSCRIPTION_PAYMENT_STATUS',
      message: 'Error fetching subscription payment status',
      successful: false,
      extra: {
        subscriptionPaymentId: subscriptionPayment.id,
        failedTransactions: failedExternalTransactionResponses,
      },
    });

    externalTransaction = null;
  }

  if (externalTransaction) {
    dogstatsd.increment('fetch_subscription_payment.successful_fetch_result', {
      gatewayName,
      transactionStatus: externalTransaction?.status,
    });
  }

  return externalTransaction;
}

export async function determinePaymentGatewaysToCheck(subscriptionPayment: SubscriptionPayment) {
  let paymentGateways: PaymentGateway[] = [];

  if (subscriptionPayment.bankAccountId) {
    const bankAccount = await BankAccount.findByPk(subscriptionPayment.bankAccountId, {
      include: [{ model: BankConnection, paranoid: false }],
      paranoid: false,
    });

    if (bankAccount.bankConnection.bankingDataSource === BankingDataSource.BankOfDave) {
      paymentGateways = [PaymentGateway.BankOfDave];
    } else {
      // MX and Plaid both use Synapsepay
      paymentGateways = [PaymentGateway.Synapsepay];
    }
  } else if (subscriptionPayment.paymentMethodId) {
    const loomisResponse = await loomisClient.getPaymentMethod({
      id: subscriptionPayment.paymentMethodId,
    });
    const paymentMethod = parseLoomisGetPaymentMethod(loomisResponse, __filename);

    if (paymentMethod.tabapayId) {
      paymentGateways = [PaymentGateway.Tabapay];
    }
  } else {
    // We have to try each, Tabapay and Synapsepay first as they are most in use.
    // Tabapay should be checked after because of new rate limit issues
    paymentGateways = [
      PaymentGateway.Synapsepay,
      PaymentGateway.Tabapay,
      PaymentGateway.BankOfDave,
    ];
  }

  return paymentGateways;
}

export async function buildSubscriptionPaymentProviders(
  subscriptionPayment: SubscriptionPayment,
): Promise<PaymentProviderGatewayParams[]> {
  const gateways: PaymentGateway[] = await determinePaymentGatewaysToCheck(subscriptionPayment);

  return gateways.map(mapGatewayNameToPaymentProvider);
}

// TODO: Removeexport after PLAT-935
export function mapGatewayNameToPaymentProvider(
  gateway: PaymentGateway,
): PaymentProviderGatewayParams {
  let processor: PaymentProcessor;

  switch (gateway) {
    case PaymentGateway.Risepay:
      processor = PaymentProcessor.Tabapay;
      break;
    case PaymentGateway.Tabapay:
      processor = PaymentProcessor.Tabapay;
      break;
    case PaymentGateway.Synapsepay:
      processor = PaymentProcessor.Synapsepay;
      break;
    case PaymentGateway.BankOfDave:
      processor = PaymentProcessor.BankOfDave;
      break;
    default:
      logger.error('Unsupported payment provider', {
        paymentProvider: gateway,
      });
  }
  return { gateway, processor };
}
