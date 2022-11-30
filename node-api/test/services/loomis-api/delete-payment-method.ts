import { expect } from 'chai';
import * as sinon from 'sinon';
import * as request from 'supertest';
import { clean } from '../../test-helpers';
import app from '../../../src/services/loomis-api';
import factory from '../../factories';
import { paymentMethodUpdateEvent } from '../../../src/domain/event';

describe('Loomis Delete Payment Method API', () => {
  const sandbox = sinon.createSandbox();
  let paymentMethodUpdateEventStub: sinon.SinonStub;

  beforeEach(async () => {
    await clean(sandbox);
    paymentMethodUpdateEventStub = sandbox.stub(paymentMethodUpdateEvent, 'publish').resolves();
  });

  describe('when invalid', () => {
    it('should throw an error for an invalid payment method ID', async () => {
      await request(app)
        .delete('/services/loomis_api/payment_method/lakers')
        .send()
        .expect(400)
        .then(response => {
          expect(response.body.type).to.eq('invalid_parameters');
          expect(response.body.message).to.contain('Must pass a valid payment method ID');
          sinon.assert.notCalled(paymentMethodUpdateEventStub);
        });
    });

    it('should throw an error if the payment method ID does not exist', async () => {
      const paymentMethod = await factory.create('payment-method');

      await request(app)
        .delete(`/services/loomis_api/payment_method/${paymentMethod.id + 1}`)
        .send()
        .expect(404)
        .then(response => {
          expect(response.body.type).to.eq('not_found');
          expect(response.body.message).to.contain('NotFound');
          sinon.assert.notCalled(paymentMethodUpdateEventStub);
        });
    });
  });

  describe('when valid', () => {
    it('should successfully delete a payment method if it exists', async () => {
      const { id } = await factory.create('payment-method');

      await request(app)
        .delete(`/services/loomis_api/payment_method/${id}`)
        .send()
        .expect(200)
        .then(response => {
          expect(response.body.success).to.eq(true);
          sinon.assert.calledOnce(paymentMethodUpdateEventStub);
        });

      // hit a get request to verify payment method no longer exists
      await request(app)
        .get(`/services/loomis_api/payment_method_details`)
        .query({ id })
        .send()
        .expect(200)
        .then(response => {
          expect(response.body).to.be.null;
          sinon.assert.calledOnce(paymentMethodUpdateEventStub);
        });
    });
  });
});
