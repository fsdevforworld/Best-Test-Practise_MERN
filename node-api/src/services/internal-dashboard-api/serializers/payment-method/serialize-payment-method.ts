import { PaymentMethod } from '@dave-inc/loomis-client';
import { BankAccount } from '../../../../models';
import serialize from '../serialize';
import IPaymentMethodResource from './i-payment-method-resource';
import serializeBankAccount from './serialize-bank-account';
import serializeLoomisPaymentMethod from './serialize-loomis-payment-method';

const serializer: serialize<
  PaymentMethod | BankAccount,
  IPaymentMethodResource
> = async function serializePaymentMethod(paymentMethod) {
  if (paymentMethod instanceof BankAccount) {
    return serializeBankAccount(paymentMethod);
  }

  return serializeLoomisPaymentMethod(paymentMethod);
};

export default serializer;
