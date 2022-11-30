import { expect } from 'chai';
import * as request from 'supertest';
import { clean } from '../../test-helpers';
import app from '../../../src/services/loomis-api';
import { Payment } from '../../../src/models';
import factory from '../../factories';
import { TransactionType } from '@dave-inc/loomis-client';
import { ExternalTransactionProcessor, ExternalTransactionStatus } from '@dave-inc/wire-typings';
import { moment } from '@dave-inc/time-lib';
import * as sinon from 'sinon';
import logger from '../../../src/lib/logger';

describe('Loomis Get Payment Details', () => {
  before(() => clean());

  const sandbox = sinon.createSandbox();
  let loggerErrorStub: sinon.SinonStub;

  beforeEach(() => {
    loggerErrorStub = sandbox.stub(logger, 'error').resolves();
  });

  afterEach(() => sandbox.restore());

  describe('getPaymentDetails', () => {
    let payment: Payment;
    let laterPayment: Payment;
    let userId: number;

    before(async () => {
      const amount = 75;
      const sooner = moment().subtract(10, 'minutes');

      const user = await factory.create('user');
      userId = user.id;

      const clock = sandbox.useFakeTimers(sooner.toDate().getTime());
      payment = await factory.create('payment', { amount, userId });

      clock.tick(1000);
      laterPayment = await factory.create('payment', { userId });
      clock.tick(1000);
      await factory.create('payment', { userId, status: ExternalTransactionStatus.Canceled });
      sandbox.restore();
    });

    it('throws on an invalid payment ID', async () => {
      await request(app)
        .get('/services/loomis_api/payment/pelican')
        .send()
        .expect(400)
        .then(response => {
          expect(response.body.type).to.eq('invalid_parameters');
        });

      sinon.assert.callCount(loggerErrorStub, 1);
    });

    it('retrieves a payment by ID', async () => {
      await request(app)
        .get(`/services/loomis_api/payment/${payment.id}`)
        .send()
        .expect(200)
        .then(response => {
          expect(response.body).to.contain({
            type: TransactionType.Replenishment,
            legacyPaymentId: payment.id,
            amountInCents: payment.amount * 100,
          });
        });

      sinon.assert.callCount(loggerErrorStub, 0);
    });

    it('returns not_found for a missing payment', async () => {
      await request(app)
        .get(`/services/loomis_api/payment/${payment.id + 100}`)
        .send()
        .expect(404)
        .then(response => {
          expect(response.body.type).to.eq('not_found');
        });

      sinon.assert.callCount(loggerErrorStub, 0);
    });

    it('returns the latest transaction that is not cancelled', async () => {
      await request(app)
        .get(`/services/loomis_api/payment/latest?userId=${userId}`)
        .send()
        .expect(200)
        .then(response => {
          expect(response.body).to.contain({
            type: TransactionType.Replenishment,
            legacyPaymentId: laterPayment.id,
          });
        });

      sinon.assert.callCount(loggerErrorStub, 0);
    });

    it('does not return a latest payment if there are none', async () => {
      await request(app)
        .get(`/services/loomis_api/payment/latest?userId=${userId + 100}`)
        .send()
        .expect(404)
        .then(response => {
          expect(response.body.type).to.eq('not_found');
        });

      sinon.assert.callCount(loggerErrorStub, 0);
    });
  });

  describe('findPaymentDetails', () => {
    const status = ExternalTransactionStatus.Pending;
    const externalId = 'pelican-pelican-xyz';
    const externalProcessor = ExternalTransactionProcessor.BankOfDave;

    let daveUserId1: number;
    let daveUserId2: number;
    let paymentWithStatus: Payment;
    let paymentWithExternalId: Payment;

    before(async () => {
      const [daveUser1, daveUser2] = await Promise.all([
        factory.create('user'),
        factory.create('user'),
      ]);
      daveUserId1 = daveUser1.id;
      daveUserId2 = daveUser2.id;
      [paymentWithStatus, paymentWithExternalId] = await Promise.all([
        factory.create('payment', { status, userId: daveUserId1 }),
        factory.create('payment', {
          externalId,
          externalProcessor,
          userId: daveUserId2,
          status: ExternalTransactionStatus.Completed,
        }),
      ]);
    });

    it('finds the payment by user ID and status', async () => {
      await request(app)
        .get(`/services/loomis_api/payment?userId=${daveUserId1}&status=${status}`)
        .send()
        .expect(200)
        .then(response => {
          expect(response.body).to.contain({
            isACH: false,
            type: TransactionType.Replenishment,
            legacyPaymentId: paymentWithStatus.id,
          });
        });

      sinon.assert.callCount(loggerErrorStub, 0);
    });

    it('does not find the payment if the user ID is wrong', async () => {
      await request(app)
        .get(`/services/loomis_api/payment?userId=${daveUserId2}&status=${status}`)
        .send()
        .expect(404)
        .then(response => {
          expect(response.body.type).to.eq('not_found');
        });

      sinon.assert.callCount(loggerErrorStub, 0);
    });

    it('does not find the payment if the status is wrong', async () => {
      const wrongStatus = ExternalTransactionStatus.Canceled;
      await request(app)
        .get(`/services/loomis_api/payment?userId=${daveUserId1}&status=${wrongStatus}`)
        .send()
        .expect(404)
        .then(response => {
          expect(response.body.type).to.eq('not_found');
        });

      sinon.assert.callCount(loggerErrorStub, 0);
    });

    it('finds the transaction by external ID', async () => {
      await request(app)
        .get(
          `/services/loomis_api/payment?externalId=${externalId}&externalProcessor=${externalProcessor}`,
        )
        .send()
        .expect(200)
        .then(response => {
          expect(response.body).to.contain({
            isACH: false,
            type: TransactionType.Replenishment,
            legacyPaymentId: paymentWithExternalId.id,
          });
        });

      sinon.assert.callCount(loggerErrorStub, 0);
    });

    it('does not find the transaction if external ID is wrong', async () => {
      await request(app)
        .get(
          `/services/loomis_api/payment?externalId=pelicant&externalProcessor=${externalProcessor}`,
        )
        .send()
        .expect(404)
        .then(response => {
          expect(response.body.type).to.eq('not_found');
        });

      sinon.assert.callCount(loggerErrorStub, 0);
    });

    it('does not find the transaction if external processor is wrong', async () => {
      await request(app)
        .get(`/services/loomis_api/payment?externalId=${externalId}&externalProcessor=pelicanpay`)
        .send()
        .expect(404)
        .then(response => {
          expect(response.body.type).to.eq('not_found');
        });

      sinon.assert.callCount(loggerErrorStub, 0);
    });
  });
});
