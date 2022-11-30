import loomisClient from '@dave-inc/loomis-client';
import { NotFoundError } from '@dave-inc/error-types';
import { expect } from 'chai';
import * as sinon from 'sinon';
import * as request from 'supertest';
import app from '../../../../../src/services/internal-dashboard-api';
import factory from '../../../../factories';
import { clean, stubLoomisClient, withInternalUser } from '../../../../test-helpers';
import { moment } from '@dave-inc/time-lib';

describe('GET /v2/users/:id/payment-methods', () => {
  describe('successful payment method responses', () => {
    const sandbox = sinon.createSandbox();
    before(() => clean());

    afterEach(() => clean(sandbox));

    beforeEach(() => {
      stubLoomisClient(sandbox);
    });

    it('responds with all payment methods for a user', async () => {
      const { id: userId } = await factory.create('user');
      const bankAccount = await factory.create('checking-account', { userId });
      const [, deletedDebitCard] = await Promise.all([
        factory.create('payment-method', { userId, bankAccountId: bankAccount.id }),
        factory.create('payment-method', { userId, bankAccountId: bankAccount.id }),
      ]);

      await deletedDebitCard.destroy();

      const {
        body: { data },
      } = await withInternalUser(request(app).get(`/v2/users/${userId}/payment-methods`));

      expect(data).to.have.length(3);
    });

    it('returns serialized payment methods data', async () => {
      const { id: userId } = await factory.create('user');

      const bankAccount = await factory.create('checking-account', { userId });
      const paymentMethod = await factory.create('payment-method', {
        userId,
        bankAccountId: bankAccount.id,
        bin: '1234',
        displayName: 'Hi',
        invalidReasonCode: '00',
        expiration: moment('2025-01-01'),
      });

      const {
        body: {
          data: [paymentMethodResponse],
        },
      } = await withInternalUser(request(app).get(`/v2/users/${userId}/payment-methods`));

      expect(paymentMethodResponse.type).to.equal('payment-method');
      expect(paymentMethodResponse.id).to.equal(`DEBIT:${paymentMethod.id}`);
      expect(paymentMethodResponse.attributes).to.include({
        bin: '1234',
        displayName: 'Hi',
        expiration: '01/25',
        type: 'DEBIT',
        invalid: null,
        invalidReasonCode: '00',
        invalidReason: 'Approved or completed successfully',
        isAchEnabled: false,
        lastFour: '0000',
        optedIntoDaveRewards: false,
        scheme: 'visa',
        zipCode: null,
        deleted: null,
      });
      expect(paymentMethodResponse.attributes.created).to.be.a('string');
      expect(paymentMethodResponse.attributes.updated).to.be.a('string');

      const { bankAccount: bankAccountRelationship } = paymentMethodResponse.relationships;
      expect(bankAccountRelationship.data.id).to.equal(bankAccount.id.toString());
    });

    it('responds with an empty array if there are no payment methods for the user', async () => {
      const { id: userId } = await factory.create('user');

      const {
        body: { data },
      } = await withInternalUser(request(app).get(`/v2/users/${userId}/payment-methods`));

      expect(data.length).to.equal(0);
    });
  });

  describe('failed payment method responses', () => {
    const sandbox = sinon.createSandbox();
    before(() => clean());

    afterEach(() => clean(sandbox));

    it('forwards loomis error', async () => {
      sandbox
        .stub(loomisClient, 'getPaymentMethods')
        .resolves({ error: new NotFoundError('Not Found') });
      const { id: userId } = await factory.create('user');

      await withInternalUser(
        request(app)
          .get(`/v2/users/${userId}/payment-methods`)
          .expect(404),
      );
    });
  });
});
