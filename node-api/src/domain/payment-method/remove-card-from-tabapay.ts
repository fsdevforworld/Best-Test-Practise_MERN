import * as Tabapay from '../../lib/tabapay';
import loomisClient, { PaymentMethod } from '@dave-inc/loomis-client';
import { PaymentMethod as PaymentMethodModel } from '../../models';

export async function destroyPaymentMethod(paymentMethod: PaymentMethod) {
  await Tabapay.removeCard(paymentMethod.tabapayId);

  const loomisResponse = await loomisClient.deletePaymentMethod(paymentMethod.id);
  if ('error' in loomisResponse) {
    throw new Error(`Loomis gave an error in destroyPaymentMethod ${loomisResponse.error.message}`);
  }
}

export async function softDeletePaymentMethod(paymentMethod: PaymentMethod) {
  await Tabapay.removeCard(paymentMethod.tabapayId);

  const paymentModel = await PaymentMethodModel.findByPk(paymentMethod.id);

  await paymentModel.update({
    expiration: null,
    displayName: null,
    scheme: null,
    zipCode: null,
    invalid: null,
    invalidReasonCode: null,
  });
  await paymentModel.destroy();
}
