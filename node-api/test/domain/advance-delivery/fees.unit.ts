import { PaymentProviderDelivery } from '@dave-inc/wire-typings';
import { expect } from 'chai';

import { getFeesByAmount } from '../../../src/domain/advance-delivery';

describe('Fees', () => {
  describe('getFeesByAmount', () => {
    [
      {
        amount: 5,
        expected: {
          [PaymentProviderDelivery.STANDARD]: 0,
          [PaymentProviderDelivery.EXPRESS]: 1.99,
        },
      },
      {
        amount: 10,
        expected: {
          [PaymentProviderDelivery.STANDARD]: 0,
          [PaymentProviderDelivery.EXPRESS]: 2.49,
        },
      },
      {
        amount: 15,
        expected: {
          [PaymentProviderDelivery.STANDARD]: 0,
          [PaymentProviderDelivery.EXPRESS]: 2.49,
        },
      },
      {
        amount: 20,
        expected: {
          [PaymentProviderDelivery.STANDARD]: 0,
          [PaymentProviderDelivery.EXPRESS]: 2.99,
        },
      },
      {
        amount: 50,
        expected: {
          [PaymentProviderDelivery.STANDARD]: 0,
          [PaymentProviderDelivery.EXPRESS]: 3.99,
        },
      },
      {
        amount: 60,
        expected: {
          [PaymentProviderDelivery.STANDARD]: 0,
          [PaymentProviderDelivery.EXPRESS]: 3.99,
        },
      },
      {
        amount: 75,
        expected: {
          [PaymentProviderDelivery.STANDARD]: 0,
          [PaymentProviderDelivery.EXPRESS]: 4.99,
        },
      },
      {
        amount: 85,
        expected: {
          [PaymentProviderDelivery.STANDARD]: 0,
          [PaymentProviderDelivery.EXPRESS]: 4.99,
        },
      },
      {
        amount: 100,
        expected: {
          [PaymentProviderDelivery.STANDARD]: 0,
          [PaymentProviderDelivery.EXPRESS]: 5.99,
        },
      },
    ].forEach(({ amount, expected }) => {
      it(`should return the correct standard/express fees when the advance amount is ${amount}`, async () => {
        const fees = getFeesByAmount(amount);

        expect(fees).to.deep.equal(expected);
      });
    });
  });
});
