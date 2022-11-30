import { expect } from 'chai';
import { ExternalTransactionProcessor, ExternalTransactionStatus } from '@dave-inc/wire-typings';
import factory from '../../../../factories';
import { clean } from '../../../../test-helpers';
import { Payment } from '../../../../../src/models';
import { advanceSerializers } from '../../../../../src/services/internal-dashboard-api/serializers';
import { serializeDate } from '../../../../../src/serialization';
import { IApiToOneRelationshipObject } from '../../../../typings';

describe('serializeAdvancePayment', () => {
  let payment: Payment;

  let serializedResponse: advanceSerializers.IAdvancePaymentResource;
  before(async () => {
    await clean();

    const debitCard = await factory.create('payment-method');

    payment = await factory.create<Payment>('payment', {
      amount: 50,
      paymentMethodId: debitCard.id,
      status: ExternalTransactionStatus.Completed,
      externalProcessor: ExternalTransactionProcessor.Tabapay,
      referenceId: '123',
    });

    await payment.destroy();

    serializedResponse = await advanceSerializers.serializeAdvancePayment(payment);
  });

  ['amount', 'status', 'externalProcessor', 'referenceId'].forEach((prop: keyof typeof payment) => {
    it(`includes ${prop}`, async () => {
      const { attributes } = serializedResponse;

      expect((attributes as Record<string, unknown>)[prop]).to.equal(payment[prop]);
    });
  });

  ['created', 'updated', 'deleted'].forEach((prop: keyof typeof payment) => {
    it(`includes ${prop}`, async () => {
      const { attributes } = serializedResponse;

      expect((attributes as Record<string, unknown>)[prop]).to.equal(serializeDate(payment[prop]));
    });
  });

  [
    { key: 'advance', id: 'advanceId', type: 'advance' },
    { key: 'user', id: 'userId', type: 'user' },
  ].forEach(({ key, id, type }) => {
    it(`includes ${key} relationship`, () => {
      const { relationships } = serializedResponse;

      expect(relationships[key]).exist;

      const relationship = relationships[key];

      expect((relationship as IApiToOneRelationshipObject).data.id).to.equal(
        `${payment.getDataValue(id as keyof Payment)}`,
      );

      expect((relationship as IApiToOneRelationshipObject).data.type).to.equal(type);
    });
  });

  it('includes source relationship', () => {
    const {
      relationships: { source },
    } = serializedResponse;

    expect(source).exist;

    expect((source as IApiToOneRelationshipObject).data.id).to.equal(
      `DEBIT:${payment.paymentMethodId}`,
    );

    expect((source as IApiToOneRelationshipObject).data.type).to.equal('payment-method');
  });
});
