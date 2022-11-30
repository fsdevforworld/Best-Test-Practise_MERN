import * as request from 'supertest';
import { ExternalTransactionStatus } from '@dave-inc/wire-typings';
import { expect } from 'chai';
import * as sinon from 'sinon';
import factory from '../../factories';
import { clean } from '../../test-helpers';
import { insertSubscriptionEntry } from '../../../bin/dev-seed/utils';
import app from '../../../src/api';
import { SubscriptionBilling } from '../../../src/models';
import { moment, MOMENT_FORMATS } from '@dave-inc/time-lib';
import { stubLoomisClient } from '../../test-helpers';
import * as sombraClient from '../../../src/services/sombra/client';

describe('/v2/subscription_billing', () => {
  const sandbox = sinon.createSandbox();

  before(() => clean());
  beforeEach(() => {
    stubLoomisClient(sandbox);
    sandbox.stub(sombraClient, 'exchangeSession').resolves();
  });

  afterEach(() => clean(sandbox));

  describe('GET /v2/subscription_billing', () => {
    it('should return isPaidByRewards when paid by rewards', async () => {
      const user = await factory.create('user', {}, { hasSession: true });

      const month = moment().startOf('month');

      const expectedReward = await factory.create('rewards-ledger', {
        userId: user.id,
        amount: -1.0,
      });

      await factory.create('subscription-billing', {
        billingCycle: month.format(MOMENT_FORMATS.YEAR_MONTH),
        start: month,
        end: month.clone().endOf('month'),
        userId: user.id,
        rewardsLedgerId: expectedReward.id,
      });

      await factory.create('subscription-billing', {
        billingCycle: month
          .clone()
          .subtract(1, 'month')
          .format(MOMENT_FORMATS.YEAR_MONTH),
        start: month.clone().subtract(1, 'month'),
        end: month
          .clone()
          .subtract(1, 'month')
          .endOf('month'),
        userId: user.id,
      });

      const result = await request(app)
        .get('/v2/subscription_billing')
        .set('Authorization', user.id)
        .set('X-Device-Id', user.id);

      expect(result.status).to.equal(200);
      expect(result.body[0].paidByRewardsDate).to.equal(
        moment(expectedReward.created).format('YYYY-MM-DD'),
      );
      expect(result.body[1].paidByRewardsDate).to.be.null;
    });

    it('should return all rows', async () => {
      const user = await factory.create('user', {}, { hasSession: true });
      for (let i = 0; i < 10; i++) {
        const month = moment()
          .subtract(i, 'month')
          .startOf('month');
        await factory.create('subscription-billing', {
          billingCycle: month.format(MOMENT_FORMATS.YEAR_MONTH),
          start: month,
          end: month.clone().endOf('month'),
          userId: user.id,
        });
      }
      const result = await request(app)
        .get('/v2/subscription_billing')
        .set('Authorization', user.id)
        .set('X-Device-Id', user.id);

      expect(result.status).to.equal(200);
      expect(result.body.length).to.equal(10);
    });

    it('should show payment details for each billing instance', async () => {
      const user = await factory.create('user', {}, { hasSession: true });
      let payment: any;
      for (let i = 0; i < 10; i++) {
        const month = moment()
          .subtract(i, 'month')
          .startOf('month');
        const billing = await factory.create('subscription-billing', {
          billingCycle: month.format(MOMENT_FORMATS.YEAR_MONTH),
          dueDate: month,
          start: month,
          end: month.clone().endOf('month'),
          userId: user.id,
        });
        const paymentMethod = await factory.create('payment-method', {
          userId: user.id,
        });
        if (i === 1) {
          payment = await factory.create('subscription-payment', {
            paymentMethodId: paymentMethod.id,
          });
          await factory.create('subscription-payment-line-item', {
            subscriptionBillingId: billing.id,
            subscriptionPaymentId: payment.id,
          });
        } else if (i === 2) {
          payment = await factory.create('subscription-payment', {
            amount: 0.5,
            paymentMethodId: paymentMethod.id,
          });
          await factory.create('subscription-payment-line-item', {
            subscriptionBillingId: billing.id,
            subscriptionPaymentId: payment.id,
          });
        } else if (i === 3) {
          payment = await factory.create('subscription-payment', {
            paymentMethodId: paymentMethod.id,
            status: ExternalTransactionStatus.Pending,
          });
          await factory.create('subscription-payment-line-item', {
            subscriptionBillingId: billing.id,
            subscriptionPaymentId: payment.id,
          });
        }
      }
      const result = await request(app)
        .get('/v2/subscription_billing')
        .set('Authorization', user.id)
        .set('X-Device-Id', user.id);
      const today = moment().format('YYYY-MM-DD');
      const beginningOfMonth = moment(today)
        .startOf('month')
        .format('YYYY-MM-DD');
      expect(result.status).to.equal(200);
      expect(result.body.length).to.equal(10);
      expect(result.body[0].dueDate).to.equal(beginningOfMonth);
      expect(result.body[0].paymentStatus.amount).to.equal(0);
      expect(result.body[0].paymentStatus.date).to.be.null;
      expect(result.body[0].paymentStatus.status).to.be.null;
      expect(result.body[1].paymentStatus.amount).to.equal(1);
      expect(result.body[1].paymentStatus.date).to.equal(today);
      expect(result.body[1].paymentStatus.status).to.equal(ExternalTransactionStatus.Completed);
      expect(result.body[1].subscriptionPayments.length).to.equal(1);
      expect(result.body[1].subscriptionPayments[0].amount).to.equal(1);
      expect(result.body[1].subscriptionPayments[0].status).to.equal(
        ExternalTransactionStatus.Completed,
      );
      expect(result.body[1].subscriptionPayments[0].paymentMethod.mask).to.equal('0000');
      expect(result.body[1].subscriptionPayments[0].paymentMethod.scheme).to.equal('visa');
      expect(result.body[2].paymentStatus.amount).to.equal(0.5);
      expect(result.body[2].paymentStatus.date).to.equal(today);
      expect(result.body[2].paymentStatus.status).to.equal(ExternalTransactionStatus.Completed);
      expect(result.body[3].paymentStatus.amount).to.equal(1);
      expect(result.body[3].paymentStatus.date).to.equal(today);
      expect(result.body[3].paymentStatus.status).to.equal(ExternalTransactionStatus.Pending);
      for (let i = 4; i < 10; i++) {
        expect(result.body[i].paymentStatus.amount).to.equal(0);
        expect(result.body[i].paymentStatus.date).to.be.null;
        expect(result.body[i].paymentStatus.status).to.be.null;
        expect(result.body[i].paidByRewardsDate).to.be.null;
      }
    });

    it('should prefer the latest payment amongst two', async () => {
      const user = await factory.create('user');
      const userId = user.id;
      const thisMonth = moment()
        .subtract(1, 'month')
        .startOf('month');
      const amount = 1;
      const { billing: multipleBilling } = await insertSubscriptionEntry(
        userId,
        thisMonth.clone().subtract(10, 'month'),
        ExternalTransactionStatus.Returned, // The "first" attempt to pay.
        amount,
      );
      const secondPayment = await factory.create('subscription-payment', {
        amount,
        status: ExternalTransactionStatus.Completed, // The "second" attempt to pay.
        userId,
        created: moment().add(1, 'hour'), // Must be later than the other payment.
      });
      await factory.create('subscription-payment-line-item', {
        subscriptionBillingId: multipleBilling.id,
        subscriptionPaymentId: secondPayment.id,
      });

      const result = await request(app)
        .get('/v2/subscription_billing')
        .set('Authorization', user.id)
        .set('X-Device-Id', user.id);
      expect(result.status).to.equal(200);
      expect(result.body.length).to.equal(1);
      expect(result.body[0].paymentStatus.status).to.equal(ExternalTransactionStatus.Completed);
      expect(result.body[0].subscriptionPayments.length).to.equal(2);
      expect(result.body[0].subscriptionPayments[0].status).to.equal(
        ExternalTransactionStatus.Returned,
      );
      expect(result.body[0].subscriptionPayments[1].status).to.equal(
        ExternalTransactionStatus.Completed,
      );
    });
  });

  describe('POST /v2/subscription_billing/two_months_free', () => {
    it('should set the used_two_months_free flag', async () => {
      const user = await factory.create('user', {}, { hasSession: true });

      const twoMonthsFreeResult = await request(app)
        .post('/v2/subscription_billing/two_months_free')
        .set('Authorization', user.id)
        .set('X-Device-Id', user.id);

      const userResult = await request(app)
        .get('/v2/user')
        .set('Authorization', user.id)
        .set('X-Device-Id', user.id);

      await user.reload();

      expect(twoMonthsFreeResult.status).to.equal(200);
      expect(userResult.body.usedTwoMonthsFree).to.exist;
      expect(user.usedTwoMonthsFree).to.exist;
    });

    it('should fail if the used_two_months_free flag is true', async () => {
      const user = await factory.create(
        'user',
        { usedTwoMonthsFree: moment().format(MOMENT_FORMATS.DATETIME) },
        { hasSession: true },
      );

      const result = await request(app)
        .post('/v2/subscription_billing/two_months_free')
        .set('Authorization', user.id)
        .set('X-Device-Id', user.id);

      expect(result.status).to.equal(409);
    });

    it('sets unpaid billings to free and adds two months of free billings', async () => {
      const user = await factory.create('user', {}, { hasSession: true });
      const userId = user.id;

      let payment: any;
      for (let i = 0; i < 5; i++) {
        const month = moment()
          .subtract(i, 'month')
          .startOf('month');
        const billing = await factory.create('subscription-billing', {
          billingCycle: month.format(MOMENT_FORMATS.YEAR_MONTH),
          start: month,
          end: month.clone().endOf('month'),
          userId: user.id,
        });
        const paymentMethod = await factory.create('payment-method', {
          userId: user.id,
        });
        if (i === 1 || i === 2) {
          payment = await factory.create('subscription-payment', {
            paymentMethodId: paymentMethod.id,
          });
          await factory.create('subscription-payment-line-item', {
            subscriptionBillingId: billing.id,
            subscriptionPaymentId: payment.id,
          });
        } else if (i === 3) {
          payment = await factory.create('subscription-payment', {
            paymentMethodId: paymentMethod.id,
            status: ExternalTransactionStatus.Pending,
          });
          await factory.create('subscription-payment-line-item', {
            subscriptionBillingId: billing.id,
            subscriptionPaymentId: payment.id,
          });
        }
      }

      const twoMonthsFreeResult = await request(app)
        .post('/v2/subscription_billing/two_months_free')
        .set('Authorization', user.id)
        .set('X-Device-Id', user.id);

      const secondMonthBilling = await SubscriptionBilling.findOne({
        where: {
          userId,
          billingCycle: moment()
            .add(2, 'month')
            .format(MOMENT_FORMATS.YEAR_MONTH),
        },
      });

      const nextMonthBilling = await SubscriptionBilling.findOne({
        where: {
          userId,
          billingCycle: moment()
            .add(1, 'month')
            .format(MOMENT_FORMATS.YEAR_MONTH),
        },
      });

      const thisMonthsBilling = await SubscriptionBilling.findOne({
        where: {
          userId,
          billingCycle: moment().format(MOMENT_FORMATS.YEAR_MONTH),
        },
      });

      const lastMonthsBilling = await SubscriptionBilling.findOne({
        where: {
          userId,
          billingCycle: moment()
            .subtract(1, 'month')
            .format(MOMENT_FORMATS.YEAR_MONTH),
        },
      });

      expect(twoMonthsFreeResult.status).to.equal(200);
      expect(secondMonthBilling.amount).to.equal(0);
      expect(nextMonthBilling.amount).to.equal(0);
      expect(thisMonthsBilling.amount).to.equal(0);
      expect(lastMonthsBilling.amount).to.equal(1);
    });
  });
});
