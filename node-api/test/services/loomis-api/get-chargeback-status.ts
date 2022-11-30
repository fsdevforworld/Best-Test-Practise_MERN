import { PaymentProviderTransactionType } from '@dave-inc/loomis-client';
import { expect } from 'chai';
import { moment } from '@dave-inc/time-lib';
import factory from '../../factories';
import * as request from 'supertest';
import app from '../../../src/services/loomis-api';
import { TransactionSettlementStatus, TransactionSettlementType } from '@dave-inc/wire-typings';
import { TransactionSettlementSource } from '../../../src/typings';

describe('Loomis Get Chargeback Status API', () => {
  const LOOMIS_ROOT = '/services/loomis_api';

  context(
    'when transaction settlement has status CHARGEBACK, REPRESENTMENT, or not null representment_start',
    () => {
      it('should return the charges', async () => {
        const user = await factory.create('user');
        const payment = await factory.create('payment', { userId: user.id, referenceId: '789' });
        const subscriptionPayment = await factory.create('subscription-payment', {
          userId: user.id,
          referenceId: '123',
        });
        const subscriptionPayment2 = await factory.create('subscription-payment', {
          userId: user.id,
          referenceId: '456',
        });

        const settlementForPayment = await factory.create('transaction-settlement', {
          type: TransactionSettlementType.Payment,
          sourceType: TransactionSettlementSource.Payment,
          status: TransactionSettlementStatus.Chargeback,
          sourceId: payment.id,
        });
        const settlementForSubscription = await factory.create('transaction-settlement', {
          type: TransactionSettlementType.Payment,
          sourceType: TransactionSettlementSource.SubscriptionPayment,
          status: TransactionSettlementStatus.Chargeback,
          sourceId: subscriptionPayment.id,
        });
        const settlementForSubscription2 = await factory.create('transaction-settlement', {
          type: TransactionSettlementType.Payment,
          sourceType: TransactionSettlementSource.SubscriptionPayment,
          status: TransactionSettlementStatus.Completed,
          sourceId: subscriptionPayment2.id,
          representmentStart: moment(),
        });
        const response = await request(app)
          .get(`${LOOMIS_ROOT}/chargeback_status`)
          .query({ userId: user.id })
          .expect(200);

        expect(response.body).to.deep.equal({
          userIsFraudulent: true,
          charges: [
            {
              settlementId: settlementForPayment.id,
              externalId: settlementForPayment.externalId,
              referenceId: payment.referenceId,
              paymentProviderTransactionType: PaymentProviderTransactionType.AdvancePayment,
              externalProcessor: payment.externalProcessor,
            },
            {
              settlementId: settlementForSubscription.id,
              externalId: settlementForSubscription.externalId,
              referenceId: subscriptionPayment.referenceId,
              paymentProviderTransactionType: PaymentProviderTransactionType.SubscriptionPayment,
              externalProcessor: subscriptionPayment.externalProcessor,
            },
            {
              settlementId: settlementForSubscription2.id,
              externalId: settlementForSubscription2.externalId,
              referenceId: subscriptionPayment2.referenceId,
              paymentProviderTransactionType: PaymentProviderTransactionType.SubscriptionPayment,
              externalProcessor: subscriptionPayment2.externalProcessor,
            },
          ],
        });
      });
    },
  );

  context('when there are no transaction settlements with chargeback statuses', () => {
    it('should return userIsFraudulent = false', async () => {
      const user = await factory.create('user');
      const payment = await factory.create('payment', { userId: user.id });

      await factory.create('transaction-settlement', {
        type: TransactionSettlementType.Payment,
        sourceType: TransactionSettlementSource.Payment,
        status: TransactionSettlementStatus.Completed,
        sourceId: payment.id,
      });
      const response = await request(app)
        .get(`${LOOMIS_ROOT}/chargeback_status`)
        .query({ userId: user.id })
        .expect(200);

      expect(response.body).to.deep.equal({
        userIsFraudulent: false,
        charges: [],
      });
    });
  });

  context('when user does not exist', () => {
    it('should return 404 NotFoundError', async () => {
      const response = await request(app)
        .get(`${LOOMIS_ROOT}/chargeback_status`)
        .query({ userId: 0 })
        .expect(404);

      expect(response.status).to.eq(404);
      expect(response.body.message).to.match(/User not found/);
      expect(response.body.type).eq('not_found');
    });
  });
});
