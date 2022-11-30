import { expect } from 'chai';
import { capitalize } from 'lodash';
import * as request from 'supertest';
import * as sinon from 'sinon';
import {
  Advance,
  AdvanceRefund,
  AdvanceRefundLineItem,
  BankAccount,
  DashboardAction,
  DashboardAdvanceModification,
  DashboardAdvanceRepayment,
  InternalUser,
  PaymentMethod,
} from '../../../../../src/models';
import { serializeDate } from '../../../../../src/serialization';
import app from '../../../../../src/services/internal-dashboard-api';
import { ActionCode } from '../../../../../src/services/internal-dashboard-api/domain/action-log';
import { clean, stubLoomisClient, withInternalUser } from '../../../../test-helpers';
import factory from '../../../../factories';
import { ReimbursementExternalProcessor } from '../../../../../src/models/reimbursement';

describe('GET /v2/advances/:id/changelog', () => {
  const sandbox = sinon.createSandbox();

  let internalUser: InternalUser;

  before(() => clean(sandbox));

  beforeEach(async () => {
    stubLoomisClient(sandbox);

    internalUser = await factory.create('internal-user', { email: 'test@dave.com' });
  });

  afterEach(() => clean(sandbox));

  it('responds with advance modifications', async () => {
    const dashboardAction = await factory.create('dashboard-action');
    const dashboardActionReason = await factory.create('dashboard-action-reason', {
      dashboardActionId: dashboardAction.id,
    });
    const dashboardActionLog = await factory.create('dashboard-action-log', {
      dashboardActionReasonId: dashboardActionReason.id,
      internalUserId: internalUser.id,
    });
    const { advanceId, modification, id } = await factory.create('dashboard-advance-modification', {
      dashboardActionLogId: dashboardActionLog.id,
      modification: {
        paybackDate: {
          previousValue: '1999-12-31',
          currentValue: '2000-01-01',
        },
      },
    });

    const req = request(app)
      .get(`/v2/advances/${advanceId}/changelog`)
      .expect(200);

    const {
      body: { data },
    } = await withInternalUser(req);

    const [response] = data;

    const { created } = await DashboardAdvanceModification.findByPk(id);

    const details = [
      {
        type: 'modification',
        attributes: {
          name: 'paybackDate',
          previousValue: modification.paybackDate.previousValue,
          currentValue: modification.paybackDate.currentValue,
          dataType: 'date',
        },
      },
      {
        type: 'action-log',
        attributes: {
          reason: dashboardActionReason.reason,
          internalUserEmail: internalUser.email,
          created: serializeDate(dashboardActionLog.created),
          note: dashboardActionLog.note,
          zendeskTicketUrl: dashboardActionLog.zendeskTicketUrl,
        },
      },
    ];

    expect(response.id).to.equal(`advance-mod-${id}`);
    expect(response.type).to.equal('changelog-entry');
    expect(response.attributes).to.deep.equal({
      title: dashboardAction.name,
      initiator: 'agent',
      occurredAt: serializeDate(created),
      details,
    });
  });

  it('responds with agent-initiated advance refunds', async () => {
    const dashboardAction = await factory.create('dashboard-action', {
      code: ActionCode.CreateAdvanceRefund,
    });
    const dashboardActionReason = await factory.create('dashboard-action-reason', {
      dashboardActionId: dashboardAction.id,
    });
    const dashboardActionLog = await factory.create('dashboard-action-log', {
      dashboardActionReasonId: dashboardActionReason.id,
      internalUserId: internalUser.id,
    });

    const advanceRefund = await factory.create<AdvanceRefund>('advance-refund');

    const [lineItem, debitCard, reimbursement, modification] = await Promise.all([
      factory.create<AdvanceRefundLineItem>('advance-refund-line-item', {
        advanceRefundId: advanceRefund.id,
        reason: 'overpayment',
      }),
      factory.create<PaymentMethod>('payment-method', { displayName: 'Checking account' }),
      advanceRefund.getReimbursement(),
      factory.create<DashboardAdvanceModification>('dashboard-advance-modification', {
        dashboardActionLogId: dashboardActionLog.id,
        advanceId: advanceRefund.advanceId,
        modification: {
          outstanding: {
            previousValue: -50,
            currentValue: 0,
          },
        },
      }),
    ]);

    await reimbursement.update({
      externalProcessor: ReimbursementExternalProcessor.Tabapay,
      payableType: 'PAYMENT_METHOD',
      payableId: debitCard.id,
      dashboardActionLogId: dashboardActionLog.id,
    });

    const req = request(app)
      .get(`/v2/advances/${advanceRefund.advanceId}/changelog`)
      .expect(200);

    const {
      body: { data },
    } = await withInternalUser(req);

    expect(data.length).to.equal(1);

    const [response] = data;

    const { created } = await advanceRefund.reload();

    const details = [
      {
        type: 'field',
        attributes: {
          name: 'amount',
          value: reimbursement.amount,
          dataType: 'dollar',
        },
      },
      {
        type: 'field',
        attributes: {
          name: 'sentTo',
          value: 'DEBIT - Checking account',
          dataType: 'string',
        },
      },
      {
        type: 'modification',
        attributes: {
          name: 'outstanding',
          previousValue: modification.modification.outstanding.previousValue,
          currentValue: modification.modification.outstanding.currentValue,
          dataType: 'dollar',
        },
      },
      {
        type: 'action-log',
        attributes: {
          reason: capitalize(lineItem.reason),
          internalUserEmail: internalUser.email,
          created: serializeDate(dashboardActionLog.created),
          note: dashboardActionLog.note,
          zendeskTicketUrl: dashboardActionLog.zendeskTicketUrl,
        },
      },
    ];

    expect(response.id).to.equal(`advance-refund-${advanceRefund.id}`);
    expect(response.type).to.equal('changelog-entry');
    expect(response.attributes).to.deep.equal({
      title: dashboardAction.name,
      initiator: 'agent',
      occurredAt: serializeDate(created),
      details,
      status: reimbursement.status,
    });
  });

  it('responds with system-initiated advance refunds', async () => {
    const [advanceRefund, debitCard, dashboardAction] = await Promise.all([
      factory.create<AdvanceRefund>('advance-refund'),
      factory.create<PaymentMethod>('payment-method', { displayName: 'Checking account' }),
      factory.create('dashboard-action', {
        code: ActionCode.CreateAdvanceRefund,
      }),
    ]);

    const [lineItem, reimbursement] = await Promise.all([
      factory.create<AdvanceRefundLineItem>('advance-refund-line-item', {
        advanceRefundId: advanceRefund.id,
        reason: 'overpayment',
      }),
      advanceRefund.getReimbursement(),
    ]);

    await reimbursement.update({
      payableType: 'PAYMENT_METHOD',
      payableId: debitCard.id,
      externalProcessor: ReimbursementExternalProcessor.Tabapay,
    });

    const req = request(app)
      .get(`/v2/advances/${advanceRefund.advanceId}/changelog`)
      .expect(200);

    const {
      body: { data },
    } = await withInternalUser(req);

    expect(data.length).to.equal(1);

    const [response] = data;

    const { created } = await advanceRefund.reload();

    const details = [
      {
        type: 'field',
        attributes: {
          name: 'amount',
          value: reimbursement.amount,
          dataType: 'dollar',
        },
      },
      {
        type: 'field',
        attributes: {
          name: 'sentTo',
          value: 'DEBIT - Checking account',
          dataType: 'string',
        },
      },
      {
        type: 'field',
        attributes: {
          name: 'reason',
          value: capitalize(lineItem.reason),
          dataType: 'string',
        },
      },
    ];

    expect(response.id).to.equal(`advance-refund-${advanceRefund.id}`);
    expect(response.type).to.equal('changelog-entry');
    expect(response.attributes).to.deep.equal({
      title: dashboardAction.name,
      initiator: 'system',
      occurredAt: serializeDate(created),
      details,
      status: reimbursement.status,
    });
  });

  it('responds with advance collection attempts', async () => {
    const [dashboardAction, bankAccount] = await Promise.all([
      factory.create<DashboardAction>('dashboard-action', {
        code: ActionCode.CreateAdvanceRepayment,
        name: 'Attempt collection',
      }),
      factory.create<BankAccount>('bank-account', {
        displayName: 'Checkmate Checking',
        lastFour: '4321',
      }),
    ]);

    const [dashboardActionReason, advance] = await Promise.all([
      factory.create('dashboard-action-reason', {
        dashboardActionId: dashboardAction.id,
        reason: 'Advance repayment',
      }),
      factory.create<Advance>('advance', {
        amount: 20,
        outstanding: 20,
        bankAccountId: bankAccount.id,
      }),
    ]);

    const dashboardActionLog = await factory.create('dashboard-action-log', {
      dashboardActionReasonId: dashboardActionReason.id,
      internalUserId: internalUser.id,
      note: 'note',
      zendeskTicketUrl: 'zendes.k',
    });

    const dashboardAdvanceRepayment = await factory.create<DashboardAdvanceRepayment>(
      'dashboard-advance-repayment',
      {
        tivanTaskId: 'a-tisket-a-tasket',
        advanceId: advance.id,
        dashboardActionLogId: dashboardActionLog.id,
        amount: advance.outstanding,
        paymentMethodUniversalId: `BANK:${bankAccount.id}`,
        status: 'PENDING',
      },
    );

    const req = request(app)
      .get(`/v2/advances/${advance.id}/changelog`)
      .expect(200);

    const {
      body: { data },
    } = await withInternalUser(req);

    expect(data.length).to.equal(1);

    const [response] = data;

    const { created } = await dashboardAdvanceRepayment.reload();
    dashboardActionReason.reload();

    const details = [
      {
        type: 'field',
        attributes: {
          name: 'amount',
          value: 20,
          dataType: 'dollar',
        },
      },
      {
        type: 'field',
        attributes: {
          name: 'collectFrom',
          value: 'BANK - Checkmate Checking: 4321',
          dataType: 'string',
        },
      },
      {
        type: 'action-log',
        attributes: {
          reason: 'Advance repayment',
          internalUserEmail: 'test@dave.com',
          created: serializeDate(dashboardActionLog.created),
          note: 'note',
          zendeskTicketUrl: 'zendes.k',
        },
      },
    ];

    expect(response.id).to.equal('advance-repayment-a-tisket-a-tasket');
    expect(response.type).to.equal('changelog-entry');
    expect(response.attributes).to.deep.equal({
      title: 'Attempt collection',
      initiator: 'agent',
      occurredAt: serializeDate(created),
      details,
      status: 'PENDING',
    });
  });

  it('responds with payment status changes', async () => {
    const advance = await factory.create('advance');
    const dashboardAction = await factory.create('dashboard-action', {
      name: 'Advance Payment Status Change',
      code: ActionCode.AdvancePaymentStatusChange,
    });
    const dashboardActionReason = await factory.create('dashboard-action-reason', {
      dashboardActionId: dashboardAction.id,
    });
    const dashboardActionLog = await factory.create('dashboard-action-log', {
      dashboardActionReasonId: dashboardActionReason.id,
      internalUserId: internalUser.id,
    });
    const payment = await factory.create('payment', { advanceId: advance.id });
    const modification = await factory.create('dashboard-payment-modification', {
      paymentId: payment.id,
      dashboardActionLogId: dashboardActionLog.id,
      modification: {
        status: {
          previousValue: 'PENDING',
          currentValue: 'COMPLETED',
        },
        deleted: {
          previousValue: null,
          currentValue: '2021-01-01',
        },
      },
    });
    await factory.create('dashboard-advance-modification', {
      advanceId: advance.id,
      dashboardActionLogId: dashboardActionLog.id,
      modification: {
        outstanding: {
          previousValue: 100,
          currentValue: 0,
        },
      },
    });

    const req = request(app)
      .get(`/v2/advances/${advance.id}/changelog`)
      .expect(200);

    const {
      body: { data },
    } = await withInternalUser(req);

    expect(data).to.have.length(1);

    const [{ id, type, attributes }] = data;

    expect(id).to.equal(`payment-mod-${modification.id}`);
    expect(type).to.equal('changelog-entry');
    expect(attributes.title).to.equal(dashboardAction.name);
    expect(attributes.initiator).to.equal('agent');
    expect(attributes.occurredAt).to.exist;
    sinon.assert.match(attributes.details, [
      {
        type: 'modification',
        attributes: {
          name: 'paymentStatus',
          previousValue: 'PENDING',
          currentValue: 'COMPLETED',
          dataType: 'string',
        },
      },
      {
        type: 'modification',
        attributes: {
          name: 'deleted',
          previousValue: null,
          currentValue: '2021-01-01',
          dataType: 'date',
        },
      },
      {
        type: 'modification',
        attributes: {
          name: 'advanceOutstanding',
          previousValue: 100,
          currentValue: 0,
          dataType: 'dollar',
        },
      },
      {
        type: 'action-log',
        attributes: {
          reason: dashboardActionReason.reason,
          internalUserEmail: internalUser.email,
          created: sinon.match.string,
          note: dashboardActionLog.note,
          zendeskTicketUrl: dashboardActionLog.zendeskTicketUrl,
        },
      },
    ]);
  });

  it('responds with payment changes for soft deleted payments', async () => {
    const dashboardAction = await factory.create('dashboard-action', {
      name: 'Advance Payment Status Change',
      code: ActionCode.AdvancePaymentStatusChange,
    });
    const dashboardActionReason = await factory.create('dashboard-action-reason', {
      dashboardActionId: dashboardAction.id,
    });
    const dashboardActionLog = await factory.create('dashboard-action-log', {
      dashboardActionReasonId: dashboardActionReason.id,
      internalUserId: internalUser.id,
    });
    const payment = await factory.create('payment');
    const modification = await factory.create('dashboard-payment-modification', {
      paymentId: payment.id,
      dashboardActionLogId: dashboardActionLog.id,
      modification: {
        status: {
          previousValue: 'PENDING',
          currentValue: 'COMPLETED',
        },
      },
    });

    await payment.destroy();

    const req = request(app)
      .get(`/v2/advances/${payment.advanceId}/changelog`)
      .expect(200);

    const {
      body: { data },
    } = await withInternalUser(req);

    expect(data).to.have.length(1);

    const [{ id }] = data;

    expect(id).to.equal(`payment-mod-${modification.id}`);
  });
});
