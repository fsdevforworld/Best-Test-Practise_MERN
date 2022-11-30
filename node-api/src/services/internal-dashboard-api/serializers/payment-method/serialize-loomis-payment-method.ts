import { PaymentMethod } from '@dave-inc/loomis-client';
import { serializeDate } from '../../../../serialization';
import { IApiRelationshipObjects } from '../../../../typings';
import serialize from '../serialize';
import IPaymentMethodResource from './i-payment-method-resource';
import tabapayResponseCodes from './tabapay-response-codes';

const serializer: serialize<
  PaymentMethod,
  IPaymentMethodResource
> = async function serializeLoomisPaymentMethod(paymentMethod) {
  const relationships: IApiRelationshipObjects = {};

  if (paymentMethod.type === 'DEBIT') {
    const { bankAccountId } = paymentMethod;

    relationships.bankAccount = {
      data: bankAccountId ? { id: bankAccountId.toString(), type: 'bank-account' } : null,
    };
  }

  return {
    id: paymentMethod.universalId,
    type: 'payment-method',
    attributes: {
      bin: paymentMethod.bin,
      created: serializeDate(paymentMethod.created),
      deleted: serializeDate(paymentMethod.deleted),
      displayName: paymentMethod.displayName,
      expiration: serializeDate(paymentMethod.expiration, 'MM/YY'),
      invalid: serializeDate(paymentMethod.invalid),
      type: paymentMethod.type,
      invalidReasonCode: paymentMethod.invalidReasonCode,
      invalidReason: tabapayResponseCodes[paymentMethod.invalidReasonCode] || null,
      isAchEnabled: paymentMethod.validAchAccount,
      lastFour: paymentMethod.mask,
      optedIntoDaveRewards: paymentMethod.optedIntoDaveRewards,
      scheme: paymentMethod.scheme,
      updated: paymentMethod.updated,
      zipCode: paymentMethod.zipCode,
    },
    relationships,
  };
};

export default serializer;
