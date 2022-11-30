import * as request from 'supertest';
import app from '../../../../../src/services/internal-dashboard-api';
import { expect } from 'chai';
import {
  clean,
  stubLoomisClient,
  TABAPAY_ACCOUNT_ID,
  validateRelationships,
  withInternalUser,
} from '../../../../test-helpers';
import {
  Advance,
  AdvanceRefund,
  AdvanceRefundLineItem,
  DashboardActionLog,
  DashboardActionReason,
  DashboardAdvanceModification,
  PaymentMethod,
  Reimbursement,
} from '../../../../../src/models';
import factory from '../../../../factories';
import { ActionCode } from '../../../../../src/services/internal-dashboard-api/domain/action-log';
import * as Tabapay from '../../../../../src/lib/tabapay';
import {
  BankingDataSource,
  ExternalTransactionProcessor,
  ExternalTransactionStatus,
} from '@dave-inc/wire-typings';
import * as uuid from 'uuid/v4';
import * as sinon from 'sinon';
import { IApiResourceObject } from '../../../../../src/typings';
import { advanceSerializers } from '../../serializers';
import { PaymentError } from '../../../../../src/lib/error';
import { encodePaymentMethodId, PaymentGateway, PaymentMethodType } from '@dave-inc/loomis-client';
import * as Loomis from '@dave-inc/loomis-client';

const sandbox = sinon.createSandbox();

describe('POST /v2/advances/:id/refunds', () => {
  before(() => clean());
  beforeEach(() => stubLoomisClient(sandbox));

  afterEach(() => clean(sandbox));

  let debitCard: PaymentMethod;
  let advance: Advance;
  let dashboardAction;
  let dashboardActionReason: DashboardActionReason;

  beforeEach(async () => {
    debitCard = await factory.create<PaymentMethod>('payment-method', {
      tabapayId: TABAPAY_ACCOUNT_ID,
    });

    advance = await factory.create<Advance>('advance', {
      userId: debitCard.userId,
      amount: 50,
      fee: 5,
      outstanding: -50,
    });

    await factory.create('payment', {
      advanceId: advance.id,
      userId: debitCard.userId,
      paymentMethodId: debitCard.id,
      amount: 110,
      externalId: uuid(),
      status: ExternalTransactionStatus.Completed,
    });

    await factory.create('advance-tip', {
      advanceId: advance.id,
      percent: 10,
      amount: 5,
    });

    dashboardAction = await factory.create('dashboard-action', {
      code: ActionCode.CreateAdvanceRefund,
    });
    dashboardActionReason = await factory.create('dashboard-action-reason', {
      dashboardActionId: dashboardAction.id,
    });
  });

  it('Returns an advance with updated outstanding', async () => {
    sandbox.stub(Tabapay, 'disburse').resolves({
      status: ExternalTransactionStatus.Completed,
      id: 1,
      processor: ExternalTransactionProcessor.Tabapay,
    });

    const req = request(app)
      .post(`/v2/advances/${advance.id}/refunds`)
      .send({
        paymentMethodUniversalId: `DEBIT:${debitCard.id}`,
        lineItems: [
          {
            reason: 'overpayment',
            amount: 50,
          },
        ],
        dashboardActionReasonId: dashboardActionReason.id,
        zendeskTicketUrl: '123',
        note: 'late',
      })
      .expect(200);

    const {
      body: { data },
    } = await withInternalUser(req, { roleAttrs: { name: 'overdraftAdmin' } });

    expect(data.attributes.outstanding).to.equal(0);
  });

  it('Accepts dave banking accounts as payment methods', async () => {
    const bankOfDaveStub = sandbox.stub().resolves({
      status: ExternalTransactionStatus.Completed,
      processor: ExternalTransactionProcessor.BankOfDave,
    });
    const spy = sandbox
      .stub(Loomis, 'getPaymentGateway')
      .withArgs(PaymentGateway.BankOfDave)
      .returns({ createTransaction: bankOfDaveStub });

    const user = await factory.create('user');
    const bankConnection = await factory.create('bank-connection', {
      userId: user.id,
      bankingDataSource: BankingDataSource.BankOfDave,
    });
    const paymentMethod = await factory.create('bank-account', {
      userId: user.id,
      bankConnectionId: bankConnection.id,
    });

    const bankAccountAdvance = await factory.create<Advance>('advance', {
      userId: user.id,
      amount: 50,
      fee: 5,
      outstanding: -50,
    });

    await factory.create('payment', {
      advanceId: bankAccountAdvance.id,
      userId: user.id,
      paymentMethodId: debitCard.id,
      amount: 110,
      externalId: uuid(),
      status: ExternalTransactionStatus.Completed,
    });

    await factory.create('advance-tip', {
      advanceId: bankAccountAdvance.id,
      percent: 10,
      amount: 5,
    });

    const req = request(app)
      .post(`/v2/advances/${bankAccountAdvance.id}/refunds`)
      .send({
        paymentMethodUniversalId: `${encodePaymentMethodId({
          type: PaymentMethodType.DAVE_BANKING,
          id: paymentMethod.id,
        })})`,
        lineItems: [
          {
            reason: 'overpayment',
            amount: 50,
          },
        ],
        dashboardActionReasonId: dashboardActionReason.id,
        zendeskTicketUrl: '123',
        note: 'late',
      })
      .expect(200);

    await withInternalUser(req, { roleAttrs: { name: 'overdraftAdmin' } });

    sinon.assert.calledOnce(spy);
  });

  it('Does not update outstanding or create a modification if reimbursement fails', async () => {
    sandbox.stub(Tabapay, 'disburse').rejects(new PaymentError('Payment failed'));

    const req = request(app)
      .post(`/v2/advances/${advance.id}/refunds`)
      .send({
        paymentMethodUniversalId: `DEBIT:${debitCard.id}`,
        lineItems: [
          {
            reason: 'overpayment',
            amount: 50,
          },
        ],
        dashboardActionReasonId: dashboardActionReason.id,
        zendeskTicketUrl: '123',
        note: 'late',
      })
      .expect(200);

    const {
      body: { data },
    } = await withInternalUser(req, { roleAttrs: { name: 'overdraftAdmin' } });

    expect(data.attributes.outstanding).to.equal(-50);

    const actionLog = await DashboardActionLog.findOne({
      where: { dashboardActionReasonId: dashboardActionReason.id },
    });
    const advanceModification = await DashboardAdvanceModification.findOne({
      where: { dashboardActionLogId: actionLog.id, advanceId: advance.id },
    });

    expect(advanceModification).to.be.null;
  });

  it('Creates a reimbursement, advance refund, and advance line item. Returns serialized data for each.', async () => {
    sandbox.stub(Tabapay, 'disburse').resolves({
      status: ExternalTransactionStatus.Completed,
      id: 1,
      processor: ExternalTransactionProcessor.Tabapay,
    });

    const req = request(app)
      .post(`/v2/advances/${advance.id}/refunds`)
      .send({
        paymentMethodUniversalId: `DEBIT:${debitCard.id}`,
        lineItems: [
          {
            reason: 'overpayment',
            amount: 50,
          },
        ],
        dashboardActionReasonId: dashboardActionReason.id,
        zendeskTicketUrl: '123',
        note: 'late',
      })
      .expect(200);

    const {
      body: { data, included },
    } = await withInternalUser(req, { roleAttrs: { name: 'overdraftAdmin' } });

    validateRelationships(
      { data, included },
      {
        advanceRefund: 'advance-refund',
        advanceRefundLineItems: 'advance-refund-line-item',
      },
    );

    const [advanceRefundResponse]: advanceSerializers.IAdvanceRefundResource[] = included.filter(
      (includedResource: IApiResourceObject) => includedResource.type === 'advance-refund',
    );

    const [
      advanceRefundLineItemResponse,
    ]: advanceSerializers.IAdvanceRefundLineItemResource[] = included.filter(
      (includedResource: IApiResourceObject) =>
        includedResource.type === 'advance-refund-line-item',
    );

    const reimbursement = await Reimbursement.findOne({ where: { advanceId: advance.id } });

    expect(reimbursement).to.exist;
    expect(reimbursement.amount).to.eq(50);
    expect(advanceRefundResponse.attributes.reimbursementId).eql(reimbursement.id);

    const advanceRefund = await AdvanceRefund.findOne({ where: { advanceId: advance.id } });

    expect(advanceRefund).to.exist;
    expect(advanceRefund.id.toString()).to.eq(advanceRefundResponse.id);

    const advanceRefundLineItem = await AdvanceRefundLineItem.findOne({
      where: { advanceRefundId: advanceRefund.id },
    });

    expect(advanceRefundLineItem).to.exist;
    expect(advanceRefundLineItem.id.toString()).to.eq(advanceRefundLineItemResponse.id);
    expect(advanceRefundLineItem.adjustOutstanding).to.be.true;
  });

  it('Creates a DashboardAdvanceModification and a DashboardActionLog', async () => {
    sandbox.stub(Tabapay, 'disburse').resolves({
      status: ExternalTransactionStatus.Completed,
      id: 1,
      processor: ExternalTransactionProcessor.Tabapay,
    });

    const req = request(app)
      .post(`/v2/advances/${advance.id}/refunds`)
      .send({
        paymentMethodUniversalId: `DEBIT:${debitCard.id}`,
        lineItems: [
          {
            reason: 'overpayment',
            amount: 50,
          },
        ],
        dashboardActionReasonId: dashboardActionReason.id,
        zendeskTicketUrl: '123',
        note: 'late',
      })
      .expect(200);

    await withInternalUser(req, { roleAttrs: { name: 'overdraftAdmin' } });

    const actionLog = await DashboardActionLog.findOne({
      where: { dashboardActionReasonId: dashboardActionReason.id },
    });

    expect(actionLog).to.exist;

    const advanceModification = await DashboardAdvanceModification.findOne({
      where: { dashboardActionLogId: actionLog.id, advanceId: advance.id },
    });

    expect(advanceModification).to.exist;
    expect(advanceModification.modification).to.deep.eq({
      outstanding: {
        previousValue: -50,
        currentValue: 0,
      },
    });
  });

  it('creates multiple line items', async () => {
    sandbox.stub(Tabapay, 'disburse').resolves({
      status: ExternalTransactionStatus.Completed,
      id: 1,
      processor: ExternalTransactionProcessor.Tabapay,
    });

    const req = request(app)
      .post(`/v2/advances/${advance.id}/refunds`)
      .send({
        paymentMethodUniversalId: `DEBIT:${debitCard.id}`,
        lineItems: [
          {
            reason: 'fee',
            amount: 5,
          },
          {
            reason: 'tip',
            amount: 5,
          },
          {
            reason: 'overdraft',
            amount: 50,
          },
          {
            reason: 'overpayment',
            amount: 50,
          },
        ],
        dashboardActionReasonId: dashboardActionReason.id,
        zendeskTicketUrl: '123',
        note: 'late',
      })
      .expect(200);

    const {
      body: { data, included },
    } = await withInternalUser(req, { roleAttrs: { name: 'overdraftAdmin' } });

    validateRelationships(
      { data, included },
      {
        advanceRefund: 'advance-refund',
        advanceRefundLineItems: 'advance-refund-line-item',
      },
    );

    const advanceRefundResponse: advanceSerializers.IAdvanceRefundResource[] = included.filter(
      (includedResource: IApiResourceObject) => includedResource.type === 'advance-refund',
    );

    const advanceRefundLineItemResponse: advanceSerializers.IAdvanceRefundLineItemResource[] = included.filter(
      (includedResource: IApiResourceObject) =>
        includedResource.type === 'advance-refund-line-item',
    );

    expect(advanceRefundResponse).to.have.length(1);
    expect(advanceRefundLineItemResponse).to.have.length(4);
  });

  it('throws when line item does not meet criteria', async () => {
    sandbox.stub(Tabapay, 'disburse').resolves({
      status: ExternalTransactionStatus.Completed,
      id: 1,
      processor: ExternalTransactionProcessor.Tabapay,
    });

    const req = request(app)
      .post(`/v2/advances/${advance.id}/refunds`)
      .send({
        paymentMethodUniversalId: `DEBIT:${debitCard.id}`,
        lineItems: [
          {
            reason: 'fee',
            amount: 6,
          },
        ],
        dashboardActionReasonId: dashboardActionReason.id,
        zendeskTicketUrl: '123',
        note: 'late',
      })
      .expect(400);

    const res = await withInternalUser(req, { roleAttrs: { name: 'overdraftAdmin' } });

    expect(res.body.message).to.contain('Refunded fee cannot be greater than advance fee.');
  });
});
