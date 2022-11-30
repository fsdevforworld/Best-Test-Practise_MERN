import { expect } from 'chai';
import * as request from 'supertest';
import * as sinon from 'sinon';
import { moment } from '@dave-inc/time-lib';
import { ExternalTransactionProcessor } from '@dave-inc/wire-typings';
import { IApiResourceObject } from '../../../../../src/typings';
import app from '../../../../../src/services/internal-dashboard-api';
import {
  clean,
  stubLoomisClient,
  withInternalUser,
  validateRelationships,
} from '../../../../test-helpers';
import factory from '../../../../factories';
import { DashboardPayment, Payment } from '../../../../../src/models';

describe('GET /v2/payments/:id', () => {
  const sandbox = sinon.createSandbox();

  before(() => clean(sandbox));

  beforeEach(() => {
    stubLoomisClient(sandbox);
  });

  afterEach(() => clean(sandbox));

  [true, false].forEach(isSoftDeleted => {
    context(`data is soft deleted: ${isSoftDeleted}`, () => {
      let payment: Payment;
      let req: request.Test;
      beforeEach(async () => {
        payment = await factory.create<Payment>('payment', {
          externalId: 'foo-1',
          referenceId: 'foo-2',
          deleted: isSoftDeleted ? moment().toDate() : null,
        });

        req = request(app)
          .get(`/v2/payments/${payment.id}`)
          .expect(200);
      });

      it('responds with the payment', async () => {
        const {
          body: {
            data: { id, type },
          },
        } = await withInternalUser(req);

        expect(id).to.equal(`${payment.id}`);
        expect(type).to.equal('advance-payment');
      });

      it('includes debit card as the source', async () => {
        const paymentMethod = await factory.create('payment-method', {
          userId: payment.userId,
          deleted: isSoftDeleted ? moment() : null,
        });

        await payment.update({
          externalProcessor: ExternalTransactionProcessor.Tabapay,
          paymentMethodId: paymentMethod.id,
        });

        const { body } = await withInternalUser(req);

        validateRelationships(body, {
          source: 'payment-method',
        });

        const paymentMethodResponse = body.included.find(
          (resource: IApiResourceObject) => resource.type === 'payment-method',
        );

        expect(paymentMethodResponse.id).to.equal(`DEBIT:${paymentMethod.id}`);
      });

      it('includes the bank account as the source', async () => {
        const bankAccount = await factory.create('bank-account', {
          userId: payment.userId,
          deleted: isSoftDeleted ? moment() : null,
        });

        await payment.update({
          externalProcessor: ExternalTransactionProcessor.Synapsepay,
          bankAccountId: bankAccount.id,
        });

        const { body } = await withInternalUser(req);

        validateRelationships(body, {
          source: 'payment-method',
        });

        const paymentMethod = body.included.find(
          (resource: IApiResourceObject) => resource.type === 'payment-method',
        );

        expect(paymentMethod.id).to.equal(`BANK:${bankAccount.id}`);
      });

      it('includes an action log for agent initiated repayments', async () => {
        const dashboardPayment = await factory.create<DashboardPayment>('dashboard-payment', {
          tivanReferenceId: payment.referenceId,
        });

        const { body } = await withInternalUser(req);

        validateRelationships(body, {
          dashboardActionLog: 'dashboard-action-log',
        });

        const repayment = await dashboardPayment.getDashboardAdvanceRepayment({
          scope: 'withDashboardAction',
        });
        const actionLog = repayment.dashboardActionLog;

        const { id, attributes } = body.included.find(
          (resource: IApiResourceObject) => resource.type === 'dashboard-action-log',
        );

        expect(id).to.equal(`${actionLog.id}`);
        expect(attributes.reason).to.equal(actionLog.dashboardActionReason.reason);
        expect(attributes.internalUserEmail).to.equal(actionLog.internalUser.email);
        expect(attributes.note).to.equal(actionLog.note);
        expect(attributes.zendeskTicketUrl).to.equal(actionLog.zendeskTicketUrl);
      });
    });
  });

  it('includes bank account when bank connection deleted', async () => {
    const payment = await factory.create<Payment>('payment', {
      externalId: 'foo-1',
      referenceId: 'foo-2',
    });

    const req = request(app)
      .get(`/v2/payments/${payment.id}`)
      .expect(200);

    const bankConnection = await factory.create('bank-connection', {
      deleted: moment(),
    });

    const bankAccount = await factory.create('bank-account', {
      userId: payment.userId,
      bankConnectionId: bankConnection.id,
    });

    await payment.update({
      externalProcessor: ExternalTransactionProcessor.Synapsepay,
      bankAccountId: bankAccount.id,
    });

    const {
      body: { included },
    } = await withInternalUser(req);

    const paymentMethod = included.find(
      (resource: IApiResourceObject) => resource.type === 'payment-method',
    );

    expect(paymentMethod.id).to.equal(`BANK:${bankAccount.id}`);
  });
});
