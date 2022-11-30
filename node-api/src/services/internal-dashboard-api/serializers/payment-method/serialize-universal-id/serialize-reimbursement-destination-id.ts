import { encodePaymentMethodId, PaymentMethodType } from '@dave-inc/loomis-client';
import { Reimbursement } from '../../../../../models';
import { ReimbursementExternalProcessor } from '../../../../../models/reimbursement';
import debitCardProcessors from './debit-card-processors';

function serializeReimbursementDestinationId(reimbursement: Reimbursement) {
  const { externalProcessor, payableId } = reimbursement;

  if (!externalProcessor || !payableId) {
    return null;
  }

  if (externalProcessor === ReimbursementExternalProcessor.Paypal) {
    return null;
  }

  let type: PaymentMethodType;
  if (debitCardProcessors.includes(externalProcessor)) {
    type = PaymentMethodType.DEBIT_CARD;
  } else if (externalProcessor === ReimbursementExternalProcessor.BankOfDave) {
    type = PaymentMethodType.DAVE_BANKING;
  } else {
    type = PaymentMethodType.BANK_ACCOUNT;
  }

  return encodePaymentMethodId({
    id: payableId,
    type,
  });
}

export default serializeReimbursementDestinationId;
