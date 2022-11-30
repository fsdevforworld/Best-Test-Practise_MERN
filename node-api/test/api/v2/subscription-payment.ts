import { clean, replayHttp, stubLoomisClient } from '../../test-helpers';
import app from '../../../src/api';
import * as request from 'supertest';
import factory from '../../factories';
import * as sinon from 'sinon';
import { SubscriptionChargeType } from '../../../src/domain/collection';
import * as Tabapay from '../../../src/lib/tabapay';
import {
  SubscriptionBilling,
  SubscriptionCollectionAttempt,
  SubscriptionPayment,
} from '../../../src/models';
import { expect } from 'chai';

describe('POST /v2/subscription_payment', () => {
  const bodUserId = '2a82e635-d1dd-46c1-bc82-56f722a6e698';
  const bodSourceId = '0b39346b-9b00-4aee-a11e-0428fd13df81';

  const url = '/v2/subscription_payment';
  const sandbox = sinon.createSandbox();

  before(() => clean());

  beforeEach(() => stubLoomisClient(sandbox));

  afterEach(() => clean(sandbox));

  it('successfully pays the subscription billing', async () => {
    const debitCard = await factory.create('payment-method');
    const user = await debitCard.getUser();

    const [billing, session]: [SubscriptionBilling, any] = await Promise.all([
      factory.create('subscription-billing', { userId: user.id }),
      factory.create('user-session', { userId: user.id }),
    ]);

    const debitChargeStub = sandbox.stub(Tabapay, 'retrieve').resolves({
      status: 'COMPLETED',
      id: 'external-id-1',
    });

    const response = await request(app)
      .post(url)
      .set('Authorization', session.token)
      .set('X-Device-Id', session.deviceId)
      .send({
        subscriptionBillingId: billing.id,
        paymentMethodId: debitCard.id,
      });

    const isSubscription = true;
    sinon.assert.calledWith(
      debitChargeStub,
      sinon.match.string,
      sinon.match.string,
      billing.amount,
      isSubscription,
    );
    expect(response.status).equal(201);

    const payment = await SubscriptionPayment.findOne({
      where: { userId: user.id },
      include: [
        {
          model: SubscriptionBilling,
          where: { id: billing.id },
        },
      ],
    });

    const attempt = await SubscriptionCollectionAttempt.findOne({
      where: { subscriptionBillingId: billing.id },
    });

    expect(payment, 'Could not find payment in db').to.exist;
    expect(attempt.extra.chargeType).to.equal(SubscriptionChargeType.DebitChargeOnly);
    expect(response.body.subscriptionPaymentId).to.equal(
      payment.id,
      'Payment does not match database record',
    );
  });

  it(
    'does not collect from a Dave Banking account',
    replayHttp(
      'v2/subscription-payment/bod-success.json',
      async () => {
        const bankConnection = await factory.create('bank-connection', {
          externalId: bodUserId,
          bankingDataSource: 'BANK_OF_DAVE',
        });

        const bankAccount = await factory.create('bank-account', {
          bankConnectionId: bankConnection.id,
          userId: bankConnection.userId,
          externalId: bodSourceId,
        });

        const user = await bankAccount.getUser();

        const [billing, session] = await Promise.all([
          factory.create('subscription-billing', { userId: user.id }),
          factory.create('user-session', { userId: user.id }),
          user.update({ defaultBankAccountId: bankAccount.id }),
        ]);

        const response = await request(app)
          .post(url)
          .set('Authorization', session.token)
          .set('X-Device-Id', session.deviceId)
          .send({
            subscriptionBillingId: billing.id,
            paymentMethodId: null,
          });

        expect(response.status).to.equal(400);

        const payment = await SubscriptionPayment.findOne({
          where: { userId: user.id },
          include: [
            {
              model: SubscriptionBilling,
              where: { id: billing.id },
            },
          ],
        });

        expect(payment).to.not.exist;
        expect(response.body.subscriptionPaymentId).to.not.exist;
        expect(response.body.message).to.include('Bank account ineligible for collection');
      },
      {
        mode: 'record',
        before: (scope: any) => {
          scope.filteringRequestBody = (body: any) => {
            const referenceId = '6d3e0be98a003cc';

            return body
              .replace(/"paymentReferenceId":"\w*"/, `"paymentReferenceId":"${referenceId}"`)
              .replace(
                /"transactionReferenceId":"\w*"/,
                `"transactionReferenceId":"${referenceId}"`,
              );
          };
        },
      },
    ),
  );

  it('handles collection errors', async () => {
    const debitCard = await factory.create('payment-method');
    const user = await debitCard.getUser();

    const [billing, session, payment] = await Promise.all([
      factory.create('subscription-billing', { userId: user.id }),
      factory.create('user-session', { userId: user.id }),
      factory.create('subscription-payment', { userId: user.id, status: 'COMPLETED' }),
    ]);

    await billing.addSubscriptionPayment(payment);

    const response = await request(app)
      .post(url)
      .set('Authorization', session.token)
      .set('X-Device-Id', session.deviceId)
      .send({
        subscriptionBillingId: billing.id,
        paymentMethodId: debitCard.id,
      });

    expect(response.status).to.equal(409);
  });

  it('fails if the subscription billing does not belong to the user', async () => {
    const debitCard = await factory.create('payment-method');
    const user = await debitCard.getUser();

    const [billing, session] = await Promise.all([
      factory.create('subscription-billing'),
      factory.create('user-session', { userId: user.id }),
    ]);

    await request(app)
      .post(url)
      .set('Authorization', session.token)
      .set('X-Device-Id', session.deviceId)
      .send({
        subscriptionBillingId: billing.id,
        paymentMethodId: debitCard.id,
      })
      .expect(404);
  });

  it('fails if the subscription billing does not exist', async () => {
    const debitCard = await factory.create('payment-method');
    const user = await debitCard.getUser();

    const session = await factory.create('user-session', { userId: user.id });

    await request(app)
      .post(url)
      .set('Authorization', session.token)
      .set('X-Device-Id', session.deviceId)
      .send({
        subscriptionBillingId: 4142,
        paymentMethodId: debitCard.id,
      })
      .expect(404);
  });

  it('fails if no subscriptionBillingId is provided', async () => {
    const debitCard = await factory.create('payment-method');
    const user = await debitCard.getUser();

    const session = await factory.create('user-session', { userId: user.id });

    await request(app)
      .post(url)
      .set('Authorization', session.token)
      .set('X-Device-Id', session.deviceId)
      .send({
        subscriptionBillingId: null,
        paymentMethodId: debitCard.id,
      })
      .expect(400);
  });

  it('fails if no debit card is provided', async () => {
    const debitCard = await factory.create('payment-method');
    const user = await debitCard.getUser();

    const [billing, session] = await Promise.all([
      factory.create('subscription-billing', { userId: user.id }),
      factory.create('user-session', { userId: user.id }),
    ]);

    await request(app)
      .post(url)
      .set('Authorization', session.token)
      .set('X-Device-Id', session.deviceId)
      .send({
        subscriptionBillingId: billing.id,
        paymentMethodId: null,
      })
      .expect(400);
  });

  it('fails if the debit card does not belong to the user', async () => {
    const billing = await factory.create('subscription-billing');
    const user = await billing.getUser();

    const [debitCard, session] = await Promise.all([
      factory.create('payment-method'),
      factory.create('user-session', { userId: user.id }),
    ]);

    await request(app)
      .post(url)
      .set('Authorization', session.token)
      .set('X-Device-Id', session.deviceId)
      .send({
        subscriptionBillingId: billing.id,
        paymentMethodId: debitCard.id,
      })
      .expect(404);
  });
});
