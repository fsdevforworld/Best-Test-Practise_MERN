import { expect } from 'chai';
import * as request from 'supertest';
import { clean } from '../../test-helpers';
import app from '../../../src/services/loomis-api';
import { Payment } from '../../../src/models';
import factory from '../../factories';
import { ExternalTransactionStatus } from '@dave-inc/wire-typings';
import * as sinon from 'sinon';
import { ConnectionRefusedError } from 'sequelize';

describe('Loomis Get Payment Methods API', () => {
  const sandbox = sinon.createSandbox();

  before(() => clean());
  afterEach(() => sandbox.restore());

  it('should throw for missing payment Id and reference Id', async () => {
    await request(app)
      .get('/services/loomis_api/payment_status')
      .send()
      .expect(400)
      .then(response => {
        expect(response.body.type).to.eq('invalid_parameters');
        expect(response.body.message).to.contain('Must pass referenceId and userId');
      });
  });

  it('should throw for invalid reference id', async () => {
    await request(app)
      .get('/services/loomis_api/payment_status')
      .query({ referenceId: 'averyharyyellowpelican', userId: 11 })
      .send()
      .expect(400)
      .then(response => {
        expect(response.body.type).to.eq('invalid_parameters');
        expect(response.body.message).to.contain('Must pass a valid reference Id');
      });
  });

  it('should throw for an invalid userId', async () => {
    await request(app)
      .get('/services/loomis_api/payment_status')
      .query({ referenceId: 'pelican', userId: 'alsoplican' })
      .send()
      .expect(400)
      .then(response => {
        expect(response.body.type).to.eq('invalid_parameters');
        expect(response.body.message).to.contain('Must pass a valid user Id');
      });
  });

  it('should throw for missing payment by reference Id', async () => {
    const payment = await factory.create('payment', { referenceId: 'fluffyoctipus' });

    await request(app)
      .get('/services/loomis_api/payment_status')
      .query({ referenceId: payment.referenceId + 1, userId: payment.userId })
      .send()
      .expect(404)
      .then(response => {
        expect(response.body.type).to.eq('not_found');
        expect(response.body.message).to.contain('NotFound');
      });
  });

  it('should return payment status, and not return a different payment, by reference Id', async () => {
    const payment1 = await factory.create('payment', {
      status: ExternalTransactionStatus.Pending,
      referenceId: 'fluffyturtle',
    });
    await factory.create('payment', { status: ExternalTransactionStatus.Canceled });

    await request(app)
      .get(`/services/loomis_api/payment_status`)
      .query({ referenceId: payment1.referenceId, userId: payment1.userId })
      .send()
      .expect(200)
      .then(response => expect(response.body.status).to.eq(ExternalTransactionStatus.Pending));
  });

  it('should return 503 when Loomis cannot connect to the database', async () => {
    sandbox.stub(Payment, 'findOne').rejects(new ConnectionRefusedError(new Error('pelican')));
    await request(app)
      .get(`/services/loomis_api/payment_status`)
      .query({ referenceId: 'pelican', userId: 123 })
      .send()
      .expect(503)
      .then(response => expect(response.body.type).to.eq('loomis_unavailable'));
  });
});
