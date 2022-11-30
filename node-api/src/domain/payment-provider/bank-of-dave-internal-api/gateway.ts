import * as bankingInternalApiClient from '@dave-inc/banking-internal-api-client';
import ErrorHelper from '@dave-inc/error-helper';
import { PaymentProviderDelivery } from '@dave-inc/wire-typings';
import * as Config from 'config';
import { isNil } from 'lodash';
import { InvalidParametersError } from '../../../lib/error';
import logger from '../../../lib/logger';
import {
  CreateTransactionOptions,
  FetchTransactionOptions,
  IPaymentGateway,
  PaymentProviderTransaction,
  PaymentProviderTransactionType,
  ReverseTransactionOptions,
} from '../../../typings';
import getClient from '../../bank-of-dave-internal-api';
import { formatResponseError, formatReversal, formatTransaction } from './serializer';

const { SubscriptionPayment, AdvanceDisbursement, AdvancePayment } = PaymentProviderTransactionType;

class BankOfDaveInternalApiGateway implements IPaymentGateway {
  private client: bankingInternalApiClient.V1Api;
  private reverseTransactionAvailable: boolean;

  public constructor() {
    this.client = getClient();
    this.reverseTransactionAvailable = Config.get<boolean>(
      'dave.bankOfDaveInternalApi.reverseTransactionAvailable',
    );
  }

  public async fetchTransaction(
    options: FetchTransactionOptions,
  ): Promise<PaymentProviderTransaction> {
    const { referenceId, daveUserId } = options;
    try {
      if (isNil(daveUserId)) {
        throw new InvalidParametersError('No Dave User ID provided');
      }

      const apiResult = await this.client.getTransactionByReferenceId(daveUserId, referenceId);
      return formatTransaction(apiResult.data.transaction, options.referenceId, options.type);
    } catch (error) {
      const formattedError = ErrorHelper.logFormat(error);
      logger.error('PaymentGateway: failed to fetch Bank of Dave transaction', {
        ...formattedError,
        options,
      });
      return formatResponseError(error, { referenceId, type: options.type });
    }
  }

  public async createTransaction(
    options: CreateTransactionOptions,
  ): Promise<PaymentProviderTransaction> {
    switch (options.type) {
      case AdvanceDisbursement:
        return this.createAdvanceDisbursement(options);
      case SubscriptionPayment:
        return this.createSubscriptionPayment(options);
      case AdvancePayment:
        return this.createAdvancePayment(options);
      default:
        logger.error('Invalid transaction type passed to createTransaction', options);
        throw new Error(`Invalid transaction type: ${options.type}`);
    }
  }

  public async reverseTransaction(
    options: ReverseTransactionOptions,
  ): Promise<PaymentProviderTransaction> {
    if (this.reverseTransactionAvailable) {
      // TODO: This function isn't implemented on banking-api so it was removed, uncomment me if/when we implememnt this
      // return this.reverseTransactionByReferenceId(options);
    }

    return this.reverseTransactionSoonToBeDeprecated(options);
  }

  // TODO: This function isn't implemented on banking-api so it was removed, uncomment me if/when we implememnt this
  // private async reverseTransactionByReferenceId(
  //   options: ReverseTransactionOptions,
  // ): Promise<PaymentProviderTransaction | void> {
  //   if (isNil(options.daveUserId)) {
  //     throw new InvalidParametersError('User ID needed for reverseTransaction');
  //   }

  //   const result = await this.client.reverseTransactionByReferenceId(
  //     options.daveUserId,
  //     options.sourceId,
  //   );
  //   return formatReversal(result.data.transaction, options.correspondingId, options.type);
  // }

  /**
   * This is needed until we ditch Synapse
   */
  private async reverseTransactionSoonToBeDeprecated(
    options: ReverseTransactionOptions,
  ): Promise<PaymentProviderTransaction> {
    const { correspondingId, externalId, sourceId, type } = options;

    if (type !== AdvancePayment && type !== SubscriptionPayment) {
      throw new InvalidParametersError(`reverse transaction type: ${type} not valid`);
    }

    const { amount, status } = await this.fetchTransaction({
      referenceId: options.correspondingId,
      ...options,
    });

    let reversedTransaction;
    try {
      if (type === AdvancePayment) {
        reversedTransaction = await this.client.disburseToBankAccount(sourceId, {
          amount,
          referenceId: externalId,
        });
      } else {
        reversedTransaction = await this.client.disburseToBankAccount(sourceId, {
          amount,
          referenceId: externalId,
        });
      }
    } catch (error) {
      const formattedError = ErrorHelper.logFormat(error);
      logger.error('PaymentGateway: failed reversing Bank of Dave transaction', {
        ...formattedError,
        options,
      });
      return formatResponseError(error, { amount, externalId, type });
    }

    return formatReversal(reversedTransaction.data.transaction, correspondingId, type, status);
  }

  private async createAdvanceDisbursement(
    options: CreateTransactionOptions,
  ): Promise<PaymentProviderTransaction> {
    const { amount, referenceId, type } = options;
    try {
      const disbursementType = this.getDisbursementTypeFromPaymentProviderDelivery(
        options.delivery,
      );

      const result = await this.client.disburseToBankAccount(options.sourceId, {
        amount,
        referenceId,
        disbursementType,
      });
      return formatTransaction(
        result.data.transaction,
        referenceId,
        PaymentProviderTransactionType.AdvanceDisbursement,
      );
    } catch (error) {
      const formattedError = ErrorHelper.logFormat(error);
      logger.error('PaymentGateway: failed creating Bank of Dave advance disbursement', {
        ...formattedError,
        options,
      });
      return formatResponseError(error, { amount, referenceId, type });
    }
  }

  private getDisbursementTypeFromPaymentProviderDelivery(
    delivery: PaymentProviderDelivery,
  ): bankingInternalApiClient.DisbursementType {
    switch (delivery) {
      case PaymentProviderDelivery.EXPRESS:
        return bankingInternalApiClient.DisbursementType.Instant;
      default:
        return bankingInternalApiClient.DisbursementType.AdvanceStandard;
    }
  }

  private async createSubscriptionPayment(
    options: CreateTransactionOptions,
  ): Promise<PaymentProviderTransaction> {
    const { amount, referenceId, type } = options;
    try {
      const result = await this.client.collectFromBankAccount(options.sourceId, {
        amount,
        referenceId,
      });
      return formatTransaction(
        result.data.transaction,
        referenceId,
        PaymentProviderTransactionType.SubscriptionPayment,
      );
    } catch (error) {
      logger.error('PaymentGateway: failed creating Bank of Dave advance disbursement', {
        error,
        options,
      });
      return formatResponseError(error, { amount, referenceId, type });
    }
  }

  private async createAdvancePayment(
    options: CreateTransactionOptions,
  ): Promise<PaymentProviderTransaction> {
    const { amount, referenceId, type } = options;
    try {
      const result = await this.client.collectFromBankAccount(options.sourceId, {
        amount,
        referenceId,
      });
      return formatTransaction(
        result.data.transaction,
        referenceId,
        PaymentProviderTransactionType.AdvancePayment,
      );
    } catch (error) {
      const formattedError = ErrorHelper.logFormat(error);
      logger.error('PaymentGateway: failed creating Bank of Dave advance payment', {
        ...formattedError,
        options,
      });
      return formatResponseError(error, { amount, referenceId, type });
    }
  }
}

const bankOfDaveApiInterface = new BankOfDaveInternalApiGateway();
export default bankOfDaveApiInterface;
