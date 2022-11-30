import { ExternalTransactionProcessor } from '@dave-inc/wire-typings';
import { encodePaymentMethodId, PaymentMethodType } from '@dave-inc/loomis-client';
import { Advance } from '../../../../../models';
import debitCardProcessors from './debit-card-processors';

function serializeAdvanceDestinationId(advance: Advance) {
  const { disbursementProcessor, bankAccountId, paymentMethodId } = advance;

  if (!disbursementProcessor) {
    return null;
  }

  let id: number;
  let type: PaymentMethodType;

  if (debitCardProcessors.includes(disbursementProcessor)) {
    id = paymentMethodId;
    type = PaymentMethodType.DEBIT_CARD;
  } else if (disbursementProcessor === ExternalTransactionProcessor.BankOfDave) {
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

export default serializeAdvanceDestinationId;
