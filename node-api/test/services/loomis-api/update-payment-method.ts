import app from '../../../src/services/loomis-api';
import { PaymentMethod } from '../../../src/models';
import factory from '../../factories';
import { expect } from 'chai';
import { clean } from '../../test-helpers';
import * as request from 'supertest';
import * as sinon from 'sinon';

describe('Loomis Update Payment Method API', () => {
  const LOOMIS_ROOT = '/services/loomis_api';
  const sandbox = sinon.createSandbox();

  before(() => clean());
  afterEach(() => clean(sandbox));

  describe('when invalid', () => {
    it('should throw an error for an invalid payment method ID', async () => {
      const updateOptions = { optedIntoDaveRewards: false };

      await request(app)
        .patch(`${LOOMIS_ROOT}/payment_method/cookies`)
        .send(updateOptions)
        .expect(400)
        .then(response => {
          expect(response.body.type).to.eq('invalid_parameters');
          expect(response.body.message).to.contain('Must pass a valid payment method ID');
        });
    });

    it('should throw an error if no update options are provided', async () => {
      const paymentMethod = await factory.create('payment-method');

      await request(app)
        .patch(`${LOOMIS_ROOT}/payment_method/${paymentMethod.id}`)
        .send()
        .expect(400)
        .then(response => {
          expect(response.body.type).to.eq('invalid_parameters');
          expect(response.body.message).to.contain('Missing update options');
        });
    });

    it('should throw an error if the payment method does not exist', async () => {
      const paymentMethod = await factory.create('payment-method');
      const updateOptions = { invalidReasonCode: 'some reason' };

      await request(app)
        .patch(`${LOOMIS_ROOT}/payment_method/${paymentMethod.id + 1}`)
        .send(updateOptions)
        .expect(404)
        .then(response => {
          expect(response.body.type).to.eq('not_found');
          expect(response.body.message).to.contain('NotFound');
        });
    });
  });

  describe('when valid', () => {
    it('should invalidate a payment method', async () => {
      const paymentMethod = await factory.create('payment-method');
      const updateOptions = { invalidReasonCode: 'some reason' };

      expect(paymentMethod.invalid).to.be.undefined;
      expect(paymentMethod.invalidReasonCode).to.be.undefined;

      await request(app)
        .patch(`${LOOMIS_ROOT}/payment_method/${paymentMethod.id}`)
        .send(updateOptions)
        .expect(200)
        .then(response => {
          expect(response.body).to.have.property('invalid').that.is.not.null;
          expect(response.body.invalidReasonCode).to.eq('some reason');
        });

      const updatedPaymentMethod = await PaymentMethod.findByPk(paymentMethod.id);
      expect(updatedPaymentMethod).to.have.property('invalid').that.is.not.null;
      expect(updatedPaymentMethod.invalidReasonCode).to.eq('some reason');
    });

    it('should update optedIntoDaveRewards', async () => {
      const paymentMethod = await factory.create('payment-method', {
        optedIntoDaveRewards: true,
      });
      const updateOptions = { optedIntoDaveRewards: false };

      expect(paymentMethod.optedIntoDaveRewards).to.eq(true);

      await request(app)
        .patch(`${LOOMIS_ROOT}/payment_method/${paymentMethod.id}`)
        .send(updateOptions)
        .expect(200)
        .then(response => {
          expect(response.body.optedIntoDaveRewards).to.eq(false);
        });

      const updatedPaymentMethod = await PaymentMethod.findByPk(paymentMethod.id);
      expect(updatedPaymentMethod.optedIntoDaveRewards).to.eq(false);
    });

    it('should update empyrCardId', async () => {
      const paymentMethod = await factory.create('payment-method', {
        empyrCardId: 111222333,
      });
      const updateOptions = { empyrCardId: 222333444 };

      expect(paymentMethod.empyrCardId).to.eq(111222333);

      await request(app)
        .patch(`${LOOMIS_ROOT}/payment_method/${paymentMethod.id}`)
        .send(updateOptions)
        .expect(200)
        .then(response => {
          expect(response.body.empyrCardId).to.eq(222333444);
        });

      const updatedPaymentMethod = await PaymentMethod.findByPk(paymentMethod.id);
      expect(updatedPaymentMethod.empyrCardId).to.eq(222333444);
    });

    it('should update linked', async () => {
      const paymentMethod = await factory.create('payment-method', {
        linked: false,
      });
      const updateOptions = { linked: true };

      expect(paymentMethod.linked).to.eq(false);

      await request(app)
        .patch(`${LOOMIS_ROOT}/payment_method/${paymentMethod.id}`)
        .send(updateOptions)
        .expect(200)
        .then(response => {
          expect(response.body.linked).to.eq(true);
        });

      const updatedPaymentMethod = await PaymentMethod.findByPk(paymentMethod.id);
      expect(updatedPaymentMethod.linked).to.eq(true);
    });

    it('should update multiple fields', async () => {
      const paymentMethod = await factory.create('payment-method', {
        invalid: null,
        invalidReasonCode: null,
        optedIntoDaveRewards: false,
        empyrCardId: 333444555,
        linked: true,
      });
      const updateOptions = {
        invalidReasonCode: 'some reason',
        optedIntoDaveRewards: true,
        empyrCardId: 444555666,
        linked: false,
      };

      expect(paymentMethod.invalid).to.be.null;
      expect(paymentMethod.invalidReasonCode).to.be.null;
      expect(paymentMethod.optedIntoDaveRewards).to.eq(false);
      expect(paymentMethod.empyrCardId).to.eq(333444555);
      expect(paymentMethod.linked).to.eq(true);

      await request(app)
        .patch(`${LOOMIS_ROOT}/payment_method/${paymentMethod.id}`)
        .send(updateOptions)
        .expect(200)
        .then(response => {
          expect(response.body.invalid).to.not.be.null;
          expect(response.body.invalidReasonCode).to.eq('some reason');
          expect(response.body.optedIntoDaveRewards).to.eq(true);
          expect(response.body.empyrCardId).to.eq(444555666);
          expect(response.body.linked).to.eq(false);
        });

      const updatedPaymentMethod = await PaymentMethod.findByPk(paymentMethod.id);
      expect(updatedPaymentMethod.invalid).to.not.be.null;
      expect(updatedPaymentMethod.invalidReasonCode).to.eq('some reason');
      expect(updatedPaymentMethod.optedIntoDaveRewards).to.eq(true);
      expect(updatedPaymentMethod.empyrCardId).to.eq(444555666);
      expect(updatedPaymentMethod.linked).to.eq(false);
    });
  });
});
