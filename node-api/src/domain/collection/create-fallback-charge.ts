import { ExternalPayment, ExternalPaymentCreator, PaymentLikeObject } from '../../typings';
import { Moment } from '@dave-inc/time-lib';

export type FallbackChargeCreator = (
  firstCharge: ExternalPaymentCreator,
  secondCharge: ExternalPaymentCreator,
  validator: (ex: Error) => PromiseLike<boolean>,
) => ExternalPaymentCreator;
/*
  Try the first charge, if it fails run the validator on the exception. If
  the validator returns true, then attempt the second charge. This allows
  for the composing of charge attempts. Example: attempt debit card collection,
  if it fails, check to see if the card was fraud. If not fraud, then try ACH
  collection. You can even take one fallbackCharge and use it as a charge in
  another fallback charge.
*/
export function createFallbackCharge(
  firstCharge: ExternalPaymentCreator,
  secondCharge: ExternalPaymentCreator,
  validator: (ex: Error) => PromiseLike<boolean>,
): ExternalPaymentCreator {
  return async (amount: number, paymentObject: PaymentLikeObject, time?: Moment) => {
    let externalPayment: ExternalPayment;
    try {
      externalPayment = await firstCharge(amount, paymentObject, time);
    } catch (ex) {
      const canChargeSecond = await validator(ex);

      if (canChargeSecond) {
        externalPayment = await secondCharge(amount, paymentObject, time);
      } else {
        throw ex;
      }
    }

    return externalPayment;
  };
}
