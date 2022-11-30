import * as request from 'supertest';
import app from '../../../../../src/services/internal-dashboard-api';
import { expect } from 'chai';
import { clean, withInternalUser } from '../../../../test-helpers';
import factory from '../../../../factories';
import { ActionCode } from '../../../../../src/services/internal-dashboard-api/domain/action-log';
import twilio from '../../../../../src/lib/twilio';
import pubsub from '../../../../../src/lib/pubsub';
import * as sinon from 'sinon';
import * as Jobs from '../../../../../src/jobs/data';
import {
  Advance,
  DashboardAdvanceModification,
  DashboardPaymentModification,
  Payment,
} from '../../../../../src/models';
import { IAdvanceResource } from '../../serializers/advance';
import { IApiResourceObject } from '../../../../typings';

const sandbox = sinon.createSandbox();

describe('PATCH /v2/payments/:id/status', () => {
  before(() => clean());

  beforeEach(() => {
    sandbox.stub(twilio, 'send').resolves();
    sandbox.stub(pubsub, 'publish').resolves();
    sandbox.stub(Jobs, 'broadcastPaymentChangedTask');
  });

  afterEach(() => clean(sandbox));

  let dashboardAction;
  let advance: Advance;
  let payment: Payment;

  beforeEach(async () => {
    dashboardAction = await factory.create('dashboard-action', {
      code: ActionCode.AdvancePaymentStatusChange,
    });

    await Promise.all([
      factory.create('dashboard-action-reason', {
        dashboardActionId: dashboardAction.id,
        reason: 'Canceled',
      }),
      factory.create('dashboard-action-reason', {
        dashboardActionId: dashboardAction.id,
        reason: 'Completed',
      }),
    ]);

    advance = await factory.create('advance');

    const tip = await factory.create('advance-tip', { advanceId: advance.id, amount: 10 });
    payment = await factory.create('payment', {
      advanceId: advance.id,
      status: 'PENDING',
      amount: advance.amount + tip.amount,
    });
  });

  it('returns serialized payment with status updated to CANCELED', async () => {
    const req = request(app)
      .patch(`/v2/payments/${payment.id}/status`)
      .send({
        status: 'CANCELED',
        zendeskTicketUrl: '123',
        note: 'resolved',
      })
      .expect(200);

    const {
      body: { data },
    } = await withInternalUser(req);

    expect(data.type).to.equal('advance-payment');
    expect(data.id).to.equal(`${payment.id}`);
    expect(data.attributes.status).to.equal('CANCELED');
  });

  it('creates a DashboardPaymentModification with status change', async () => {
    const req = request(app)
      .patch(`/v2/payments/${payment.id}/status`)
      .send({
        status: 'CANCELED',
        zendeskTicketUrl: '123',
        note: 'resolved',
      })
      .expect(200);

    await withInternalUser(req);

    const [{ modification }] = await DashboardPaymentModification.findAll({
      where: { paymentId: payment.id },
    });

    expect(modification.status.previousValue).to.equal('PENDING');
    expect(modification.status.currentValue).to.equal('CANCELED');
  });

  it('returns serialized advance with outstanding updated to 0 and payment with status updated to COMPLETED', async () => {
    const req = request(app)
      .patch(`/v2/payments/${payment.id}/status`)
      .send({
        status: 'COMPLETED',
        zendeskTicketUrl: '123',
        note: 'bank messed up',
      })
      .expect(200);

    const {
      body: { data, included },
    } = await withInternalUser(req);

    const [serializedAdvance]: IAdvanceResource[] = included.filter(
      (item: IApiResourceObject) => item.type === 'advance',
    );

    expect(data.type).to.equal('advance-payment');
    expect(data.id).to.equal(`${payment.id}`);
    expect(data.attributes.status).to.equal('COMPLETED');

    expect(serializedAdvance.type).to.equal('advance');
    expect(serializedAdvance.id).to.equal(`${advance.id}`);
    expect(serializedAdvance.attributes.outstanding).to.equal(0);
  });

  it('creates a DashboardAdvanceModification when the advance outstanding changes', async () => {
    const newAdvance = await factory.create('advance', { amount: 75, outstanding: 85 });
    const newTip = await factory.create('advance-tip', { advanceId: newAdvance.id, amount: 10 });

    const newPayment = await factory.create('payment', {
      advanceId: newAdvance.id,
      status: 'PENDING',
      amount: 25,
    });

    const req = request(app)
      .patch(`/v2/payments/${newPayment.id}/status`)
      .send({
        status: 'COMPLETED',
        zendeskTicketUrl: '123',
        note: 'resolved',
      })
      .expect(200);

    await withInternalUser(req);

    const [{ modification }] = await DashboardAdvanceModification.findAll({
      where: { advanceId: newAdvance.id },
    });

    expect(modification.outstanding.previousValue).to.equal(newAdvance.amount + newTip.amount);
    expect(modification.outstanding.currentValue).to.equal(
      newAdvance.amount + newTip.amount - newPayment.amount,
    );
  });

  it('does not create a DashboardAdvanceModification when the outstanding does not change', async () => {
    const newAdvance = await factory.create('advance', { amount: 75, outstanding: 0, fee: 0 });
    await factory.create('advance-tip', { advanceId: newAdvance.id, amount: 0 });

    const newPayment = await factory.create('payment', {
      advanceId: newAdvance.id,
      status: 'PENDING',
      amount: 75,
    });

    const req = request(app)
      .patch(`/v2/payments/${newPayment.id}/status`)
      .send({
        status: 'COMPLETED',
        zendeskTicketUrl: '123',
        note: 'resolved',
      })
      .expect(200);

    await withInternalUser(req);

    const advanceModifications = await DashboardAdvanceModification.findAll({
      where: { advanceId: newAdvance.id },
    });

    expect(advanceModifications.length).to.equal(0);
  });

  it('removes the deleted timestamp if the status is updated to COMPLETED', async () => {
    await payment.destroy();
    await payment.reload({ paranoid: false });

    expect(payment.deleted).to.be.string;

    const req = request(app)
      .patch(`/v2/payments/${payment.id}/status`)
      .send({
        status: 'COMPLETED',
        zendeskTicketUrl: '123',
        note: 'resolved',
      })
      .expect(200);

    await withInternalUser(req);

    await payment.reload({ paranoid: false });

    expect(payment.deleted).to.be.null;

    const [{ modification }] = await DashboardPaymentModification.findAll({
      where: { paymentId: payment.id },
    });

    sinon.assert.match(modification, {
      deleted: {
        previousValue: sinon.match.string,
        currentValue: null,
      },
    });
  });

  it('returns a 204 when status updated to same status as payment', async () => {
    const req = request(app)
      .patch(`/v2/payments/${payment.id}/status`)
      .send({
        status: 'PENDING',
        zendeskTicketUrl: '123',
        note: 'resolved',
      })
      .expect(204);

    await withInternalUser(req);
  });

  it('returns a 400 when status updated to an invalid status', async () => {
    const req = request(app)
      .patch(`/v2/payments/${payment.id}/status`)
      .send({
        status: 'CHARGEBACK',
        zendeskTicketUrl: '123',
        note: 'resolved',
      })
      .expect(400);

    await withInternalUser(req);
  });
});
