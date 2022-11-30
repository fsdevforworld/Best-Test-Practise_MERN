import 'mocha';
import * as sinon from 'sinon';
import { expect } from 'chai';
import 'chai-as-promised';
import { PaymentMethodResponse } from '@dave-inc/wire-typings';
import { getExpectedDelivery } from '../../src/domain/advance-delivery';
import { paymentMethodModelToType } from '../../src/typings';
import {
  mapAndSerializePayments,
  serializeDate,
  serializePaymentMethod,
  serializeAdvanceComplexResponse,
} from '../../src/serialization';
import factory from '../factories';
import { clean, up, stubLoomisClient } from '../test-helpers';

const DATE_FORMAT = 'YYYY-MM-DD';

describe('SerializeAdvanceComplexResponse', () => {
  const sandbox = sinon.createSandbox();

  before(() => clean());

  beforeEach(async () => {
    await up();
    stubLoomisClient(sandbox);
  });

  afterEach(() => clean(sandbox));

  describe('serializePaymentMethod', () => {
    it('should format a payment method', async () => {
      const paymentMethodModel = await factory.create('payment-method');

      const paymentMethod = paymentMethodModelToType(paymentMethodModel);
      const paymentMethodResponse = serializePaymentMethod(paymentMethod, DATE_FORMAT);

      const expectedResult: PaymentMethodResponse = {
        id: paymentMethod.id,
        displayName: paymentMethod.displayName,
        scheme: paymentMethod.scheme,
        mask: paymentMethod.mask,
        expiration: serializeDate(paymentMethod.expiration, DATE_FORMAT),
        invalid: serializeDate(paymentMethod.invalid, DATE_FORMAT),
        optedIntoDaveRewards: false,
        empyrCardId: null,
        zipCode: null,
      };

      expect(paymentMethodResponse).to.deep.equal(expectedResult);
    });

    it('should handle a missing payment method', () => {
      const paymentMethodResponse = serializePaymentMethod(undefined, DATE_FORMAT);

      expect(paymentMethodResponse).to.equal(null);
    });

    it('should handle a null payment method', () => {
      const paymentMethodResponse = serializePaymentMethod(null, DATE_FORMAT);

      expect(paymentMethodResponse).to.equal(null);
    });
  });

  describe('mapAndSerializeComplexResponse', () => {
    it('should map and serialize payments', async () => {
      const paymentMethodModelOne = await factory.create('payment-method');
      const paymentMethodModelTwo = await factory.create('payment-method');
      const paymentMethodModelThree = await factory.create('payment-method');

      const paymentOne = await factory.create('payment', {
        paymentMethodId: paymentMethodModelOne.id,
      });
      const paymentTwo = await factory.create('payment', {
        paymentMethodId: paymentMethodModelTwo.id,
      });
      const paymentThree = await factory.create('payment', {
        paymentMethodId: paymentMethodModelThree.id,
      });

      const paymentMethodOne = paymentMethodModelToType(paymentMethodModelOne);
      const paymentMethodTwo = paymentMethodModelToType(paymentMethodModelTwo);
      const paymentMethodThree = paymentMethodModelToType(paymentMethodModelThree);

      const mappedAndSerializedPayments = await mapAndSerializePayments(
        [paymentOne, paymentTwo, paymentThree],
        DATE_FORMAT,
      );

      expect(mappedAndSerializedPayments).to.deep.equal([
        {
          id: paymentOne.id,
          userId: paymentOne.userId,
          advanceId: paymentOne.advanceId,
          bankAccountId: paymentOne.bankAccountId,
          bankTransactionId: paymentOne.bankTransactionId,
          paymentMethodId: paymentOne.paymentMethodId,
          amount: paymentOne.amount,
          legacyId: paymentOne.legacyId,
          externalProcessor: paymentOne.externalProcessor,
          externalId: paymentOne.externalId,
          referenceId: paymentOne.referenceId,
          status: paymentOne.status,
          paymentMethod: serializePaymentMethod(paymentMethodOne, DATE_FORMAT),
          deleted: serializeDate(paymentOne.deleted, DATE_FORMAT),
          created: serializeDate(paymentOne.created, DATE_FORMAT),
          updated: serializeDate(paymentOne.updated, DATE_FORMAT),
        },
        {
          id: paymentTwo.id,
          userId: paymentTwo.userId,
          advanceId: paymentTwo.advanceId,
          bankAccountId: paymentTwo.bankAccountId,
          bankTransactionId: paymentTwo.bankTransactionId,
          paymentMethodId: paymentTwo.paymentMethodId,
          amount: paymentTwo.amount,
          legacyId: paymentTwo.legacyId,
          externalProcessor: paymentTwo.externalProcessor,
          externalId: paymentTwo.externalId,
          referenceId: paymentTwo.referenceId,
          status: paymentTwo.status,
          paymentMethod: serializePaymentMethod(paymentMethodTwo, DATE_FORMAT),
          deleted: serializeDate(paymentTwo.deleted, DATE_FORMAT),
          created: serializeDate(paymentTwo.created, DATE_FORMAT),
          updated: serializeDate(paymentTwo.updated, DATE_FORMAT),
        },
        {
          id: paymentThree.id,
          userId: paymentThree.userId,
          advanceId: paymentThree.advanceId,
          bankAccountId: paymentThree.bankAccountId,
          bankTransactionId: paymentThree.bankTransactionId,
          paymentMethodId: paymentThree.paymentMethodId,
          amount: paymentThree.amount,
          legacyId: paymentThree.legacyId,
          externalProcessor: paymentThree.externalProcessor,
          externalId: paymentThree.externalId,
          referenceId: paymentThree.referenceId,
          status: paymentThree.status,
          paymentMethod: serializePaymentMethod(paymentMethodThree, DATE_FORMAT),
          deleted: serializeDate(paymentThree.deleted, DATE_FORMAT),
          created: serializeDate(paymentThree.created, DATE_FORMAT),
          updated: serializeDate(paymentThree.updated, DATE_FORMAT),
        },
      ]);
    });

    it('should map and serialize a payment with a soft deleted payment method', async () => {
      const paymentMethodModel = await factory.create('payment-method');
      const payment = await factory.create('payment', { paymentMethodId: paymentMethodModel.id });
      await paymentMethodModel.destroy();

      const paymentMethod = paymentMethodModelToType(paymentMethodModel);
      const mappedAndSerializedPayments = await mapAndSerializePayments([payment], DATE_FORMAT);

      expect(mappedAndSerializedPayments).to.deep.equal([
        {
          id: payment.id,
          userId: payment.userId,
          advanceId: payment.advanceId,
          bankAccountId: payment.bankAccountId,
          bankTransactionId: payment.bankTransactionId,
          paymentMethodId: payment.paymentMethodId,
          amount: payment.amount,
          legacyId: payment.legacyId,
          externalProcessor: payment.externalProcessor,
          externalId: payment.externalId,
          referenceId: payment.referenceId,
          status: payment.status,
          paymentMethod: serializePaymentMethod(paymentMethod, DATE_FORMAT),
          deleted: serializeDate(payment.deleted, DATE_FORMAT),
          created: serializeDate(payment.created, DATE_FORMAT),
          updated: serializeDate(payment.updated, DATE_FORMAT),
        },
      ]);
    });

    it('should map and serialize a payment with a missing payment method', async () => {
      const payment = await factory.create('payment');
      const mappedAndSerializedPayments = await mapAndSerializePayments([payment], DATE_FORMAT);

      expect(mappedAndSerializedPayments).to.deep.equal([
        {
          id: payment.id,
          userId: payment.userId,
          advanceId: payment.advanceId,
          bankAccountId: payment.bankAccountId,
          bankTransactionId: payment.bankTransactionId,
          paymentMethodId: payment.paymentMethodId,
          amount: payment.amount,
          legacyId: payment.legacyId,
          externalProcessor: payment.externalProcessor,
          externalId: payment.externalId,
          referenceId: payment.referenceId,
          status: payment.status,
          paymentMethod: null,
          deleted: serializeDate(payment.deleted, DATE_FORMAT),
          created: serializeDate(payment.created, DATE_FORMAT),
          updated: serializeDate(payment.updated, DATE_FORMAT),
        },
      ]);
    });
  });

  describe('serializeAdvanceComplexResponse', () => {
    it('should correctly serialize an advance response', async () => {
      const user = await factory.create('user');
      const advance = await factory.create('advance', { userId: user.id });
      const advanceTip = await factory.create('advance-tip', { advanceId: advance.id });

      const paymentMethodModel = await factory.create('payment-method');
      const paymentOne = await factory.create('payment', {
        advanceId: advance.id,
        paymentMethodId: paymentMethodModel.id,
      });
      const paymentTwo = await factory.create('payment', {
        advanceId: advance.id,
        paymentMethodId: paymentMethodModel.id,
      });
      const paymentThree = await factory.create('payment', {
        advanceId: advance.id,
        paymentMethodId: paymentMethodModel.id,
      });

      const paymentMethodFromLoomis = paymentMethodModelToType(paymentMethodModel);
      const paymentMethod = serializePaymentMethod(paymentMethodFromLoomis, DATE_FORMAT);

      const serializedResponse = await serializeAdvanceComplexResponse(advance, DATE_FORMAT, [
        paymentOne,
        paymentTwo,
        paymentThree,
      ]);

      const expectedDelivery = serializeDate(
        getExpectedDelivery(advance.created, advance.delivery),
      );

      expect(serializedResponse).to.deep.equal({
        id: advance.id,
        amount: advance.amount,
        bankAccountId: advance.bankAccountId,
        created: serializeDate(advance.created),
        closed: false,
        delivery: undefined,
        destination: null,
        disbursementBankTransactionId: undefined,
        disbursementStatus: 'COMPLETED',
        donationOrganization: undefined,
        expectedDelivery,
        fee: advance.fee,
        isExperimental: false,
        name: undefined,
        network: null,
        outstanding: advance.outstanding,
        paybackDate: serializeDate(advance.paybackDate, DATE_FORMAT),
        tip: parseFloat(advanceTip.amount),
        tipPercent: advanceTip.percent,
        payments: [
          {
            id: paymentOne.id,
            userId: paymentOne.userId,
            advanceId: paymentOne.advanceId,
            bankAccountId: paymentOne.bankAccountId,
            bankTransactionId: paymentOne.bankTransactionId,
            paymentMethodId: paymentOne.paymentMethodId,
            amount: paymentOne.amount,
            legacyId: paymentOne.legacyId,
            externalProcessor: paymentOne.externalProcessor,
            externalId: paymentOne.externalId,
            referenceId: paymentOne.referenceId,
            status: paymentOne.status,
            paymentMethod,
            deleted: serializeDate(paymentOne.deleted, DATE_FORMAT),
            created: serializeDate(paymentOne.created, DATE_FORMAT),
            updated: serializeDate(paymentOne.updated, DATE_FORMAT),
          },
          {
            id: paymentTwo.id,
            userId: paymentTwo.userId,
            advanceId: paymentTwo.advanceId,
            bankAccountId: paymentTwo.bankAccountId,
            bankTransactionId: paymentTwo.bankTransactionId,
            paymentMethodId: paymentTwo.paymentMethodId,
            amount: paymentTwo.amount,
            legacyId: paymentTwo.legacyId,
            externalProcessor: paymentTwo.externalProcessor,
            externalId: paymentTwo.externalId,
            referenceId: paymentTwo.referenceId,
            status: paymentTwo.status,
            paymentMethod,
            deleted: serializeDate(paymentTwo.deleted, DATE_FORMAT),
            created: serializeDate(paymentTwo.created, DATE_FORMAT),
            updated: serializeDate(paymentTwo.updated, DATE_FORMAT),
          },
          {
            id: paymentThree.id,
            userId: paymentThree.userId,
            advanceId: paymentThree.advanceId,
            bankAccountId: paymentThree.bankAccountId,
            bankTransactionId: paymentThree.bankTransactionId,
            paymentMethodId: paymentThree.paymentMethodId,
            amount: paymentThree.amount,
            legacyId: paymentThree.legacyId,
            externalProcessor: paymentThree.externalProcessor,
            externalId: paymentThree.externalId,
            referenceId: paymentThree.referenceId,
            status: paymentThree.status,
            paymentMethod,
            deleted: serializeDate(paymentThree.deleted, DATE_FORMAT),
            created: serializeDate(paymentThree.created, DATE_FORMAT),
            updated: serializeDate(paymentThree.updated, DATE_FORMAT),
          },
        ],
      });
    });
  });
});
