import { PaymentMethod, PaymentMethodType } from '@dave-inc/loomis-client';
import { BankAccount } from '../../../../models';
import { get } from '../../domain/payment-method';

function serializeBankDisplayName(bankAccount: BankAccount) {
  return `${PaymentMethodType.BANK_ACCOUNT} - ${bankAccount.displayName}: ${bankAccount.lastFour}`;
}

function serializeLoomisDisplayName(paymentMethod: PaymentMethod) {
  return `${paymentMethod.type} - ${paymentMethod.displayName}`;
}

async function serializeDisplayName(universalId: string) {
  if (!universalId) {
    return null;
  }

  const paymentMethod = await get(universalId);

  if (paymentMethod instanceof BankAccount) {
    return serializeBankDisplayName(paymentMethod);
  } else if (paymentMethod) {
    return serializeLoomisDisplayName(paymentMethod);
  }

  return universalId;
}

export default serializeDisplayName;
