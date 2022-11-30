import { ExternalTransactionProcessor } from '@dave-inc/wire-typings';
import { encodePaymentMethodId, PaymentMethodType } from '@dave-inc/loomis-client';
import { Payment, SubscriptionPayment } from '../../../../../models';
import debitCardProcessors from './debit-card-processors';

function serializeSourceUniversalId(payment: Payment | SubscriptionPayment) {
  const { externalProcessor, bankAccountId, paymentMethodId } = payment;

  if (!externalProcessor) {
    return null;
  }

  let id: number;
  let type: PaymentMethodType;

  if (debitCardProcessors.includes(externalProcessor)) {
    id = paymentMethodId;
    type = PaymentMethodType.DEBIT_CARD;
  } else if (externalProcessor === ExternalTransactionProcessor.BankOfDave) {
    id = bankAccountId;
    type = PaymentMethodType.DAVE_BANKING;
  } else {
    id = bankAccountId;
    type = PaymentMethodType.BANK_ACCOUNT;
  }

  if (!id) {
    return null;
  }

  return encodePaymentMethodId({
    type,
    id,
  });
}

export default serializeSourceUniversalId;
