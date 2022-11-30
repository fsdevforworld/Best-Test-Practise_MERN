import * as request from 'supertest';
import app from '../../../../../src/services/internal-dashboard-api';
import { expect } from 'chai';
import { clean, createInternalUser, withInternalUser } from '../../../../test-helpers';
import factory from '../../../../factories';

import {
  User,
  DashboardActionReason,
  DashboardAction,
  DashboardActionLog,
  DashboardSubscriptionBillingModification,
  SubscriptionBilling,
} from '../../../../../src/models';
import { IDashboardModification } from '../../../../../src/typings';
import { moment } from '@dave-inc/time-lib';

describe('POST /v2/subscription-billings/free-months', () => {
  before(() => clean());
  afterEach(() => clean());

  const freeMonthsCode = 'give-free-months';

  describe('happy path', () => {
    let user: User;
    let seedBilling: SubscriptionBilling;
    let dashboardAction: DashboardAction;
    let dashboardActionReason: DashboardActionReason;
    let req: request.Test;

    beforeEach(async () => {
      seedBilling = await factory.create<SubscriptionBilling>('subscription-billing');
      user = await seedBilling.getUser();

      dashboardAction = await factory.create('dashboard-action', {
        code: freeMonthsCode,
      });
      dashboardActionReason = await factory.create('dashboard-action-reason', {
        dashboardActionId: dashboardAction.id,
      });

      req = request(app).post('/v2/subscription-billings/free-months');
    });

    it('should give free months', async () => {
      req = req
        .send({
          userId: user.id,
          count: 1,
          dashboardActionReasonId: dashboardActionReason.id,
          zendeskTicketUrl: '123',
        })
        .expect(200);

      const {
        body: { data: billingResponse },
      } = await withInternalUser(req);

      const billings = await SubscriptionBilling.findAll({ where: { userId: user.id } });

      expect(billings).to.have.length(2);

      const [, newBilling] = billings;
      const [newBillingResponse] = billingResponse;

      expect(parseInt(newBillingResponse.id, 10)).to.equal(newBilling.id);
      expect(newBilling.amount).to.equal(0);
      expect(newBilling.billingCycle).to.equal(
        moment(seedBilling.start)
          .add(1, 'month')
          .format('YYYY-MM'),
      );
    });

    it('should give multiple free months', async () => {
      req = req
        .send({
          userId: user.id,
          count: 2,
          dashboardActionReasonId: dashboardActionReason.id,
          zendeskTicketUrl: '123',
        })
        .expect(200);

      await withInternalUser(req);

      const billings = await SubscriptionBilling.findAll({ where: { userId: user.id } });

      expect(billings).to.have.length(3);
    });

    it('should start with next unused billing cycle', async () => {
      const nextMonth = moment(seedBilling.start).add(1, 'month');
      await factory.create('subscription-billing', {
        userId: user.id,
        start: () => nextMonth.startOf('month').format('YYYY-MM-DD'),
        end: () => nextMonth.endOf('month').format('YYYY-MM-DD HH:mm:ss'),
        amount: 1,
        billingCycle: () => nextMonth.format('YYYY-MM'),
        dueDate: () => nextMonth.format('YYYY-MM-DD'),
      });

      req = req
        .send({
          userId: user.id,
          count: 1,
          dashboardActionReasonId: dashboardActionReason.id,
          zendeskTicketUrl: '123',
        })
        .expect(200);

      await withInternalUser(req);

      const billings = await SubscriptionBilling.findAll({ where: { userId: user.id } });

      expect(billings).to.have.length(3);

      const [, , newBilling] = billings;

      expect(newBilling.amount).to.equal(0);
      expect(newBilling.billingCycle).to.equal(
        moment(seedBilling.start)
          .add(2, 'month')
          .format('YYYY-MM'),
      );
    });

    it('should create dashboard action log and subscription modification', async () => {
      const agent = await createInternalUser();

      req = req
        .send({
          userId: user.id,
          count: 1,
          dashboardActionReasonId: dashboardActionReason.id,
          zendeskTicketUrl: '123',
          note: 'big 2 dolla discount',
        })
        .expect(200);

      await withInternalUser(req, agent);

      const actionLog = await DashboardActionLog.findOne({
        where: { dashboardActionReasonId: dashboardActionReason.id, internalUserId: agent.id },
      });

      const subscriptionModification = await DashboardSubscriptionBillingModification.findOne({
        where: { dashboardActionLogId: actionLog.id },
      });

      expect(actionLog).to.not.be.null;
      expect(actionLog.note).to.eq('big 2 dolla discount');
      expect(actionLog.zendeskTicketUrl).to.eq('123');

      const expectedModification: IDashboardModification = {
        amount: {
          previousValue: null,
          currentValue: 0,
        },
        billingCycle: {
          previousValue: null,
          currentValue: moment(seedBilling.start)
            .add(1, 'month')
            .format('YYYY-MM'),
        },
      };

      expect(subscriptionModification).to.not.be.null;
      expect(subscriptionModification.modification).to.eql(expectedModification);
    });

    it('should create multiple dashboard action logs and subscription modifications', async () => {
      const agent = await createInternalUser();

      req = req
        .send({
          userId: user.id,
          count: 2,
          dashboardActionReasonId: dashboardActionReason.id,
          zendeskTicketUrl: '123',
          note: 'big 2 dolla discount',
        })
        .expect(200);

      await withInternalUser(req, agent);

      const actionLogs = await DashboardActionLog.findAll({
        where: { dashboardActionReasonId: dashboardActionReason.id, internalUserId: agent.id },
      });

      const subscriptionModifications = await DashboardSubscriptionBillingModification.findAll({
        where: { dashboardActionLogId: actionLogs.map(log => log.id) },
      });

      expect(actionLogs).to.have.length(2);
      expect(subscriptionModifications).to.have.length(2);

      const [first, second] = actionLogs;

      expect(first.note)
        .to.eq(second.note)
        .to.eq('big 2 dolla discount');
      expect(first.zendeskTicketUrl)
        .to.eq(second.zendeskTicketUrl)
        .to.eq('123');

      const expectedFirstModification: IDashboardModification = {
        amount: {
          previousValue: null,
          currentValue: 0,
        },
        billingCycle: {
          previousValue: null,
          currentValue: moment(seedBilling.start)
            .add(1, 'month')
            .format('YYYY-MM'),
        },
      };

      const expectedSecondModification: IDashboardModification = {
        amount: {
          previousValue: null,
          currentValue: 0,
        },
        billingCycle: {
          previousValue: null,
          currentValue: moment(seedBilling.start)
            .add(2, 'month')
            .format('YYYY-MM'),
        },
      };

      const [firstMod, secondMod] = subscriptionModifications;

      expect(firstMod.modification).to.eql(expectedFirstModification);
      expect(secondMod.modification).to.eql(expectedSecondModification);
    });
  });

  it('should only give free months in the future', async () => {
    const lastMonth = moment().subtract(1, 'month');

    const seedBilling = await factory.create<SubscriptionBilling>('subscription-billing', {
      start: lastMonth.startOf('month'),
      end: lastMonth.endOf('month'),
      billingCycle: lastMonth.format('YYYY-MM'),
      dueDate: lastMonth.startOf('month'),
    });
    const user = await seedBilling.getUser();
    const dashboardAction = await factory.create('dashboard-action', {
      code: freeMonthsCode,
    });
    const dashboardActionReason = await factory.create('dashboard-action-reason', {
      dashboardActionId: dashboardAction.id,
    });

    const req = request(app)
      .post('/v2/subscription-billings/free-months')
      .send({
        userId: user.id,
        count: 1,
        dashboardActionReasonId: dashboardActionReason.id,
        zendeskTicketUrl: '123',
        note: 'big 1 dolla discount',
      })
      .expect(200);

    await withInternalUser(req);

    const [oldBilling, newBilling] = await SubscriptionBilling.findAll({
      where: { userId: user.id },
    });

    expect(oldBilling.billingCycle).to.equal(
      moment()
        .subtract(1, 'month')
        .format('YYYY-MM'),
    );
    expect(newBilling.billingCycle).to.equal(
      moment()
        .add(1, 'month')
        .format('YYYY-MM'),
    );
  });

  it('should throw if count is less than 1', async () => {
    const user = await factory.create('subscribed-user');

    const req = request(app)
      .post('/v2/subscription-billings/free-months')
      .send({
        userId: user.id,
        count: 0,
        dashboardActionReasonId: 123,
        zendeskTicketUrl: '123',
        note: 'no discount',
      })
      .expect(400);

    const res = await withInternalUser(req);

    expect(res.body.message).to.include('Count must be greater than 0');
  });

  it('should succeed if user has no subscription billings', async () => {
    const user = await factory.create('subscribed-user');

    const dashboardAction = await factory.create('dashboard-action', {
      code: freeMonthsCode,
    });
    const dashboardActionReason = await factory.create('dashboard-action-reason', {
      dashboardActionId: dashboardAction.id,
    });

    const req = request(app)
      .post('/v2/subscription-billings/free-months')
      .send({
        userId: user.id,
        count: 1,
        dashboardActionReasonId: dashboardActionReason.id,
        zendeskTicketUrl: '123',
      })
      .expect(200);

    await withInternalUser(req);

    const billings = await SubscriptionBilling.findAll({ where: { userId: user.id } });

    expect(billings).to.have.length(1);

    const [newBilling] = billings;

    expect(newBilling.amount).to.equal(0);
    expect(newBilling.billingCycle).to.equal(
      moment()
        .startOf('month')
        .add(1, 'month')
        .format('YYYY-MM'),
    );
  });
});
