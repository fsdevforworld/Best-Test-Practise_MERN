import { moment } from '@dave-inc/time-lib';
import { expect } from 'chai';
import * as request from 'supertest';
import {
  Advance,
  DashboardActionLog,
  DashboardAdvanceModification,
} from '../../../../../src/models';
import app from '../../../../../src/services/internal-dashboard-api';
import factory from '../../../../factories';
import { clean, createInternalUser, withInternalUser } from '../../../../test-helpers';

import { IDashboardModification } from '../../../../typings';

describe('PATCH /v2/advances/:id/payback-date', () => {
  before(() => clean());

  afterEach(() => clean());

  const updatePaybackDateCode = 'payback-date-change';

  it('should update payback_date and create dashboard action log and advance modification', async () => {
    const newPaybackDate = moment().add(1, 'days');

    const advance = await factory.create<Advance>('advance');
    await factory.create('advance-tip', {
      advanceId: advance.id,
      percent: 10,
    });
    const dashboardAction = await factory.create('dashboard-action', {
      code: updatePaybackDateCode,
    });
    const dashboardActionReason = await factory.create('dashboard-action-reason', {
      dashboardActionId: dashboardAction.id,
    });

    const agent = await createInternalUser();

    const req = request(app)
      .patch(`/v2/advances/${advance.id}/payback-date`)
      .send({
        paybackDate: newPaybackDate,
        dashboardActionReasonId: dashboardActionReason.id,
        zendeskTicketUrl: '123',
        note: 'late',
      })
      .expect(200);

    const {
      body: {
        data: {
          attributes: { paybackDate },
        },
      },
    } = await withInternalUser(req, agent);

    expect(paybackDate).to.eq(newPaybackDate.format('YYYY-MM-DD'));

    const actionLog = await DashboardActionLog.findOne({
      where: { dashboardActionReasonId: dashboardActionReason.id, internalUserId: agent.id },
    });

    const advanceModification = await DashboardAdvanceModification.findOne({
      where: { dashboardActionLogId: actionLog.id },
    });

    expect(actionLog).to.not.be.null;
    expect(actionLog.note).to.eq('late');
    expect(actionLog.zendeskTicketUrl).to.eq('123');

    const expectedModification: IDashboardModification = {
      paybackDate: {
        previousValue: advance.paybackDate.format('YYYY-MM-DD'),
        currentValue: newPaybackDate.format('YYYY-MM-DD'),
      },
    };

    expect(advanceModification).to.not.be.null;
    expect(advanceModification.modification).to.eql(expectedModification);
  });

  it('should succeed when optional note is missing', async () => {
    const newPaybackDate = moment().add(1, 'days');

    const advance = await factory.create<Advance>('advance');
    await factory.create('advance-tip', {
      advanceId: advance.id,
      percent: 10,
    });
    const dashboardAction = await factory.create('dashboard-action', {
      code: updatePaybackDateCode,
    });
    const dashboardActionReason = await factory.create('dashboard-action-reason', {
      dashboardActionId: dashboardAction.id,
    });

    const req = request(app)
      .patch(`/v2/advances/${advance.id}/payback-date`)
      .send({
        paybackDate: newPaybackDate,
        dashboardActionReasonId: dashboardActionReason.id,
        zendeskTicketUrl: '123',
      })
      .expect(200);

    await withInternalUser(req);
  });

  it('should throw BadRequestError dashboard action reason is not for payback date change dashboard action', async () => {
    const newPaybackDate = moment().add(1, 'days');

    const advance = await factory.create<Advance>('advance');
    await factory.create('advance-tip', {
      advanceId: advance.id,
      percent: 10,
    });
    const dashboardAction = await factory.create('dashboard-action', {
      code: 'gobble-gobble',
    });
    const dashboardActionReason = await factory.create('dashboard-action-reason', {
      dashboardActionId: dashboardAction.id,
    });

    const req = request(app)
      .patch(`/v2/advances/${advance.id}/payback-date`)
      .send({
        paybackDate: newPaybackDate,
        dashboardActionReasonId: dashboardActionReason.id,
        zendeskTicketUrl: '123',
      })
      .expect(400);

    const res = await withInternalUser(req);

    expect(res.body.message).to.include(
      `Dashboard action reason provided does not correspond to the "${updatePaybackDateCode}" dashboard action`,
    );
  });

  it('should throw BadRequestError when required params are missing', async () => {
    const advance = await factory.create<Advance>('advance');

    const req = request(app)
      .patch(`/v2/advances/${advance.id}/payback-date`)
      .send({})
      .expect(400);

    const res = await withInternalUser(req);

    expect(res.body.message).to.include(
      'Required parameters not provided: paybackDate, dashboardActionReasonId, zendeskTicketUrl',
    );
  });

  it('should throw NotFoundError when dashboardActionReasonId not found', async () => {
    const newPaybackDate = moment().add(1, 'days');

    const advance = await factory.create<Advance>('advance');

    const req = request(app)
      .patch(`/v2/advances/${advance.id}/payback-date`)
      .send({
        paybackDate: newPaybackDate,
        dashboardActionReasonId: 1,
        zendeskTicketUrl: '123',
        note: 'late',
      })
      .expect(404);

    const res = await withInternalUser(req);

    expect(res.body.message).to.include('DashboardActionReason with id 1 not found');
  });
});
