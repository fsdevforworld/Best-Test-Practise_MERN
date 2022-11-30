import {
  FetchTransactionOptions,
  PaymentProcessor,
  PaymentProviderTransactionType,
  ReverseTransactionOptions,
  IExternalTransaction,
} from '../../typings';
import { Advance, BankAccount, BankConnection, Payment } from '../../models';
import { InvalidParametersError } from '../../lib/error';
import logger from '../../lib/logger';

async function getBankAccountForTransaction(
  item: IExternalTransaction,
): Promise<BankAccount | null> {
  if (item.bankAccountId) {
    return BankAccount.findOne({
      include: [{ model: BankConnection, paranoid: false }],
      where: { id: item.bankAccountId },
      paranoid: false,
    });
  } else if (item.advanceId) {
    const advance =
      item.advance || (await Advance.findOne({ paranoid: false, where: { id: item.advanceId } }));
    return advance.getBankAccount({
      include: [{ model: BankConnection, paranoid: false }],
      paranoid: false,
    });
  }

  return null;
}

async function buildSynapseFetchRequest(
  transaction: IExternalTransaction,
  defaultOptions: FetchTransactionOptions,
) {
  const bankAccount = await getBankAccountForTransaction(transaction);

  // If we cannot find a bank account we can still query using the dave user
  // which is queried by default if sourceId, ownerId and secret are not provided
  if (!bankAccount) {
    return defaultOptions;
  }

  const user = await bankAccount.getUser({ paranoid: false });

  return {
    ...defaultOptions,
    sourceId: bankAccount.synapseNodeId,
    ownerId: user.synapsepayId,
    secret: `${user.legacyId || user.id}`,
  };
}

async function buildBankOfDaveFetchRequest(
  transaction: IExternalTransaction,
  defaultOptions: FetchTransactionOptions,
) {
  const bankAccount = await getBankAccountForTransaction(transaction);
  if (!bankAccount) {
    return defaultOptions;
  }
  let correspondingId: string;
  if (transaction instanceof Payment) {
    const advance = await transaction.getAdvance({ paranoid: false });
    correspondingId = advance.externalId;
  }
  return {
    ...defaultOptions,
    sourceId: bankAccount.externalId,
    ownerId: bankAccount.bankConnection.externalId,
    correspondingId,
    daveUserId: bankAccount.userId,
  };
}

export async function buildReverseRequest(
  payment: Payment,
  processor: PaymentProcessor,
  type: PaymentProviderTransactionType,
  sourceId?: string,
): Promise<ReverseTransactionOptions> {
  const fetchRequest = await buildFetchRequest(
    payment,
    processor,
    PaymentProviderTransactionType.AdvancePayment,
    sourceId,
  );
  return {
    ...fetchRequest,
    externalId: payment.externalId,
  };
}

export async function buildFetchRequest(
  transaction: IExternalTransaction,
  processor: PaymentProcessor,
  type: PaymentProviderTransactionType,
  sourceId?: string,
  daveUserId?: number,
): Promise<FetchTransactionOptions> {
  const { externalId, referenceId } = transaction;

  const options: FetchTransactionOptions = {
    externalId,
    referenceId,
    processor,
    sourceId,
    type,
    daveUserId: transaction.userId,
  };

  switch (processor) {
    case PaymentProcessor.BankOfDave:
      return buildBankOfDaveFetchRequest(transaction, options);
    case PaymentProcessor.Synapsepay:
      return buildSynapseFetchRequest(transaction, options);
    case PaymentProcessor.Blastpay:
    case PaymentProcessor.Tabapay:
    case PaymentProcessor.TabapayACH:
    case PaymentProcessor.Payfi:
      return options;
    default:
      logger.error(`buildRequest not implemented for processor: ${processor}`);
      throw new InvalidParametersError(
        `buildFetchRequest not implemented for processor: ${processor}`,
      );
  }
}
