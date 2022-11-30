import * as sinon from 'sinon';
import * as request from 'supertest';
import { expect } from 'chai';
import { moment } from '@dave-inc/time-lib';
import { clean, stubLoomisClient, withInternalUser } from '@test-helpers';
import { Advance, Payment } from '../../../../../src/models';
import factory from '../../../../factories';
import app from '../../../../../src/services/internal-dashboard-api';
import {
  BankAccount,
  PaymentGateway,
  PaymentMethod,
  PaymentProcessor,
  PaymentProviderTransactionStatus,
  PaymentProviderTransactionType,
} from '@dave-inc/loomis-client';
import * as Loomis from '@dave-inc/loomis-client';
import * as Jobs from '../../../../../src/jobs/data';
import * as Notification from '../../../../../src/domain/notifications';
import {
  AdvanceDelivery,
  ExternalTransactionProcessor,
  ExternalTransactionStatus,
} from '@dave-inc/wire-typings';

describe('POST /v2/payments/:id/refresh', () => {
  const sandbox = sinon.createSandbox();

  before(() => clean(sandbox));

  let req: request.Test;
  let advance: Advance;
  let payment: Payment;
  let bankAccount: BankAccount;
  let paymentMethod: PaymentMethod;

  beforeEach(async () => {
    stubLoomisClient(sandbox);
    sandbox.stub(Jobs, 'broadcastPaymentChangedTask');
    sandbox.stub(Notification, 'sendAdvancePaymentFailed');

    const tabapayStub = sandbox.stub().resolves({
      type: PaymentProviderTransactionType.AdvanceDisbursement,
      externalId: null,
      referenceId: null,
      amount: 0.1,
      gateway: PaymentGateway.Tabapay,
      processor: PaymentProcessor.Tabapay,
      status: PaymentProviderTransactionStatus.Completed,
    });
    sandbox
      .stub(Loomis, 'getPaymentGateway')
      .withArgs(PaymentGateway.Tabapay)
      .returns({ fetchTransaction: tabapayStub });

    bankAccount = await factory.create('checking-account');
    paymentMethod = await factory.create('payment-method', {
      bankAccountId: bankAccount.id,
      userId: bankAccount.userId,
      tabapayId: 'tabapay',
      risepayId: null,
    });

    advance = await factory.create('advance', {
      delivery: AdvanceDelivery.Express,
      paymentMethodId: paymentMethod.id,
      bankAccountId: bankAccount.id,
      userId: paymentMethod.userId,
    });

    payment = await factory.create('payment', {
      advanceId: advance.id,
      userId: bankAccount.userId,
      paymentMethodId: paymentMethod.id,
      amount: 75,
      status: ExternalTransactionStatus.Pending,
      externalId: null,
      referenceId: null,
      externalProcessor: ExternalTransactionProcessor.Tabapay,
    });

    await factory.create('advance-tip', { advanceId: advance.id, amount: 0, percent: 0 });

    req = request(app)
      .post(`/v2/payments/${payment.id}/refresh`)
      .expect(200);
  });

  afterEach(() => clean(sandbox));

  it('returns updated payment', async () => {
    const {
      body: {
        data: { id, type, attributes },
      },
    } = await withInternalUser(req);

    expect(id).to.equal(`${payment.id}`);
    expect(type).to.equal('advance-payment');
    expect(attributes.status).to.equal(ExternalTransactionStatus.Completed);
    expect(attributes.externalProcessor).to.equal(payment.externalProcessor);
    expect(attributes.externalId).to.equal(payment.externalId);
    expect(attributes.referenceId).to.equal(payment.referenceId);
    expect(attributes.created).to.be.string;
    expect(attributes.updated).to.be.string;
  });

  it('returns deleted payment', async () => {
    payment = await factory.create('payment', {
      advanceId: advance.id,
      userId: bankAccount.userId,
      paymentMethodId: paymentMethod.id,
      amount: 75,
      status: ExternalTransactionStatus.Pending,
      externalId: null,
      referenceId: null,
      deleted: moment(),
      externalProcessor: ExternalTransactionProcessor.Tabapay,
    });

    req = request(app)
      .post(`/v2/payments/${payment.id}/refresh`)
      .expect(200);

    const {
      body: {
        data: { id, type, attributes },
      },
    } = await withInternalUser(req);

    expect(id).to.equal(`${payment.id}`);
    expect(type).to.equal('advance-payment');
    expect(attributes.deleted).to.be.string;
  });
});
