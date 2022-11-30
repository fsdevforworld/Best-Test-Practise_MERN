import * as request from 'supertest';
import * as sinon from 'sinon';
import app from '../../../../../src/services/internal-dashboard-api';
import {
  clean,
  createInternalUser,
  stubUserUpdateBroadcasts,
  withInternalUser,
} from '../../../../test-helpers';
import factory from '../../../../factories';
import { expect } from 'chai';
import {
  DashboardActionLog,
  DashboardActionReason,
  DashboardUserModification,
  User,
} from '../../../../../src/models';
import { AnalyticsEvent, IDashboardModification } from '../../../../../src/typings';

describe('PATCH /v2/users/:id/first-name', () => {
  const sandbox = sinon.createSandbox();
  const stubs: { [key: string]: sinon.SinonStub } = {};

  const updateFirstNameCode = 'user-first-name-change';

  before(() => clean());

  beforeEach(() => {
    const broadcastStubs = stubUserUpdateBroadcasts(sandbox);
    Object.assign(stubs, broadcastStubs);
  });

  afterEach(() => clean(sandbox));

  describe('happy path', async () => {
    let user: User;
    let dashboardAction;
    let dashboardActionReason: DashboardActionReason;
    let req: request.Test;

    const newFirstName = 'Zap';

    beforeEach(async () => {
      user = await factory.create<User>('user');

      dashboardAction = await factory.create('dashboard-action', {
        code: updateFirstNameCode,
      });
      dashboardActionReason = await factory.create('dashboard-action-reason', {
        dashboardActionId: dashboardAction.id,
      });

      req = request(app)
        .patch(`/v2/users/${user.id}/first-name`)
        .send({
          firstName: newFirstName,
          dashboardActionReasonId: dashboardActionReason.id,
          zendeskTicketUrl: 'zende.sk',
          note: 'nimbus',
        })
        .expect(200);
    });

    it('should update name', async () => {
      const {
        body: {
          data: {
            attributes: { firstName },
          },
        },
      } = await withInternalUser(req);

      expect(firstName).to.equal(newFirstName);
    });

    it('should create dashboard action log and user modification', async () => {
      const agent = await createInternalUser();

      const expectedModification: IDashboardModification = {
        firstName: {
          previousValue: user.firstName,
          currentValue: newFirstName,
        },
      };

      await withInternalUser(req, agent);

      const actionLog = await DashboardActionLog.findOne({
        where: { dashboardActionReasonId: dashboardActionReason.id, internalUserId: agent.id },
      });

      expect(actionLog.note).to.eq('nimbus');
      expect(actionLog.zendeskTicketUrl).to.eq('zende.sk');

      const userModification = await DashboardUserModification.findOne({
        where: { dashboardActionLogId: actionLog.id },
      });

      expect(userModification.modification).to.eql(expectedModification);
    });

    it('should broadcast changes', async () => {
      await withInternalUser(req);

      sinon.assert.calledWithExactly(stubs.publishUserUpdatedEventStub, {
        nameChanged: true,
        userId: user.id,
      });

      sinon.assert.calledWithExactly(stubs.updateSynapsepayUserTaskStub, {
        userId: user.id,
        options: {
          fields: {
            addressLine1: undefined,
            addressLine2: undefined,
            birthdate: undefined,
            city: undefined,
            firstName: newFirstName,
            lastName: undefined,
            license: undefined,
            state: undefined,
            zipCode: undefined,
          },
        },
      });

      sinon.assert.calledWithExactly(stubs.updateBrazeTaskStub, {
        userId: user.id,
        attributes: { firstName: newFirstName, lastName: undefined },
        eventProperties: [{ name: AnalyticsEvent.NameUpdated }],
      });
    });
  });

  it('should throw if dashboard action code does not match', async () => {
    const dashboardActionReason = await factory.create('dashboard-action-reason');
    const user = await factory.create('user');

    const req = request(app)
      .patch(`/v2/users/${user.id}/first-name`)
      .send({
        firstName: 'Zap',
        dashboardActionReasonId: dashboardActionReason.id,
        zendeskTicketUrl: 'zende.sk',
      })
      .expect(400);

    const res = await withInternalUser(req);

    expect(res.body.message).to.include(
      `Dashboard action reason provided does not correspond to the "${updateFirstNameCode}" dashboard action`,
    );

    sinon.assert.notCalled(stubs.publishUserUpdatedEventStub);
    sinon.assert.notCalled(stubs.updateSynapsepayUserTaskStub);
    sinon.assert.notCalled(stubs.updateBrazeTaskStub);
  });

  it('should throw if name is not valid pattern', async () => {
    const dashboardAction = await factory.create('dashboard-action', {
      code: updateFirstNameCode,
    });
    const dashboardActionReason = await factory.create('dashboard-action-reason', {
      dashboardActionId: dashboardAction.id,
    });
    const user = await factory.create('user');

    const req = request(app)
      .patch(`/v2/users/${user.id}/first-name`)
      .send({
        firstName: 'Zap23',
        dashboardActionReasonId: dashboardActionReason.id,
        zendeskTicketUrl: 'zende.sk',
      })
      .expect(400);

    const res = await withInternalUser(req);

    expect(res.body.message).to.include(`Name is not formatted correctly`);

    sinon.assert.notCalled(stubs.publishUserUpdatedEventStub);
    sinon.assert.notCalled(stubs.updateSynapsepayUserTaskStub);
    sinon.assert.notCalled(stubs.updateBrazeTaskStub);
  });
});
