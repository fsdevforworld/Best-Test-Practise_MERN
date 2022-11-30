import * as request from 'supertest';
import app from '../../../../src/services/internal-dashboard-api';
import * as sinon from 'sinon';
import { sequelize } from '../../../../src/models';
import * as Tabapay from '../../../../src/lib/tabapay';
import { expect } from 'chai';
import { clean, up, stubLoomisClient, withInternalUser } from '../../../test-helpers';
import factory from '../../../factories';
import { QueryTypes } from 'sequelize';

describe('/dashboard/payment_method/* endpoints', () => {
  const sandbox = sinon.createSandbox();

  before(() => clean());

  beforeEach(async () => {
    stubLoomisClient(sandbox);
    await up();
  });

  afterEach(() => clean(sandbox));

  describe('DELETE', () => {
    it('should delete a payment_method', async () => {
      const url = '/dashboard/payment_method/1300';
      const result = await withInternalUser(request(app).delete(url));

      expect(result.status).to.equal(200);

      const paymentMethodResult = await sequelize.query<any>(
        'SELECT * FROM payment_method WHERE id = ?',
        { replacements: [1300], type: QueryTypes.SELECT },
      );
      expect(paymentMethodResult.length).to.equal(0);
    });
  });

  describe('GET /payment_method/:id/fetch', () => {
    context('has payment method id associated with a proper payment method', () => {
      it('should give account info for Tabapay', async () => {
        sandbox.stub(Tabapay, 'fetchAccount').returns({ id: 'TabapayId' });
        const paymentMethod = await factory.create('payment-method');
        const result = await withInternalUser(
          request(app).get(`/dashboard/payment_method/${paymentMethod.id}/fetch`),
        );

        expect(result.status).to.equal(200);
        expect(result.body).to.deep.equal({
          tabapay: {
            id: 'TabapayId',
          },
        });
      });
    });

    context('does not payment method id associated with a proper payment method', () => {
      it('should throw an error because no payment method found with payment id', async () => {
        const result = await withInternalUser(
          request(app).get(`/dashboard/payment_method/3000/fetch`),
        );
        expect(result.status).to.equal(404);
        expect(result.body.message).to.match(/Payment Method not found/);
      });
    });

    context('payment method is unsupported', () => {
      it('should throw an UnsupportedPaymentProcessorError when the payment method is risepay', async () => {
        const paymentMethod = await factory.create('payment-method-risepay');

        const result = await withInternalUser(
          request(app).get(`/dashboard/payment_method/${paymentMethod.id}/fetch`),
        );

        expect(result.status).to.equal(422);
        expect(result.body.type).to.equal('unsupported_payment_processor_error');
        expect(result.body.message).to.match(/Risepay is no longer supported/);
      });
    });
  });
});
