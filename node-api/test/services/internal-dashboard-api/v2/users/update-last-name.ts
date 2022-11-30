import * as request from 'supertest';
import * as sinon from 'sinon';
import * as Jobs from '../../../../../src/jobs/data';
import app from '../../../../../src/services/internal-dashboard-api';
import { clean, createInternalUser, withInternalUser } from '../../../../test-helpers';
import factory from '../../../../factories';
import { expect } from 'chai';
import {
  DashboardActionLog,
  DashboardActionReason,
  DashboardUserModification,
  User,
} from '../../../../../src/models';
import { userUpdatedEvent } from '../../../../../src/domain/event';
import { AnalyticsEvent, IDashboardModification } from '../../../../../src/typings';

describe('PATCH /v2/users/:userId/last-name', () => {
  const sandbox = sinon.createSandbox();

  let updateBrazeJobStub: sinon.SinonStub;
  let updateSynapseJobTask: sinon.SinonStub;
  let publishUserUpdatedEventStub: sinon.SinonStub;

  const updateLastNameCode = 'user-last-name-change';

  before(() => clean());

  beforeEach(() => {
    publishUserUpdatedEventStub = sandbox.stub(userUpdatedEvent, 'publish').resolves();
    updateBrazeJobStub = sandbox.stub(Jobs, 'updateBrazeTask');
    updateSynapseJobTask = sandbox.stub(Jobs, 'updateSynapsepayUserTask').resolves();
  });

  afterEach(() => clean(sandbox));

  describe('happy path', async () => {
    let user: User;
    let dashboardAction;
    let dashboardActionReason: DashboardActionReason;
    let req: request.Test;

    const newLastName = 'Zap';

    beforeEach(async () => {
      user = await factory.create<User>('user');

      dashboardAction = await factory.create('dashboard-action', {
        code: updateLastNameCode,
      });
      dashboardActionReason = await factory.create('dashboard-action-reason', {
        dashboardActionId: dashboardAction.id,
      });

      req = request(app)
        .patch(`/v2/users/${user.id}/last-name`)
        .send({
          lastName: newLastName,
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
            attributes: { lastName },
          },
        },
      } = await withInternalUser(req);

      expect(lastName).to.equal(newLastName);
    });

    it('should create dashboard action log and user modification', async () => {
      const agent = await createInternalUser();

      const expectedModification: IDashboardModification = {
        lastName: {
          previousValue: user.lastName,
          currentValue: newLastName,
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

      sinon.assert.calledWithExactly(publishUserUpdatedEventStub, {
        nameChanged: true,
        userId: user.id,
      });

      sinon.assert.calledWithExactly(updateSynapseJobTask, {
        userId: user.id,
        options: {
          fields: {
            addressLine1: undefined,
            addressLine2: undefined,
            birthdate: undefined,
            city: undefined,
            firstName: undefined,
            lastName: newLastName,
            license: undefined,
            state: undefined,
            zipCode: undefined,
          },
        },
      });

      sinon.assert.calledWithExactly(updateBrazeJobStub, {
        userId: user.id,
        attributes: { firstName: undefined, lastName: newLastName },
        eventProperties: [{ name: AnalyticsEvent.NameUpdated }],
      });
    });
  });

  it('should throw if dashboard action code does not match', async () => {
    const dashboardActionReason = await factory.create('dashboard-action-reason');
    const user = await factory.create('user');

    const req = request(app)
      .patch(`/v2/users/${user.id}/last-name`)
      .send({
        lastName: 'Zap',
        dashboardActionReasonId: dashboardActionReason.id,
        zendeskTicketUrl: 'zende.sk',
      })
      .expect(400);

    const res = await withInternalUser(req);

    expect(res.body.message).to.include(
      `Dashboard action reason provided does not correspond to the "${updateLastNameCode}" dashboard action`,
    );

    sinon.assert.notCalled(publishUserUpdatedEventStub);
    sinon.assert.notCalled(updateSynapseJobTask);
    sinon.assert.notCalled(updateBrazeJobStub);
  });

  it('should throw if name is not valid pattern', async () => {
    const dashboardAction = await factory.create('dashboard-action', {
      code: updateLastNameCode,
    });
    const dashboardActionReason = await factory.create('dashboard-action-reason', {
      dashboardActionId: dashboardAction.id,
    });
    const user = await factory.create('user');

    const req = request(app)
      .patch(`/v2/users/${user.id}/last-name`)
      .send({
        lastName: 'Zap23',
        dashboardActionReasonId: dashboardActionReason.id,
        zendeskTicketUrl: 'zende.sk',
      })
      .expect(400);

    const res = await withInternalUser(req);

    expect(res.body.message).to.include(`Name is not formatted correctly`);

    sinon.assert.notCalled(publishUserUpdatedEventStub);
    sinon.assert.notCalled(updateSynapseJobTask);
    sinon.assert.notCalled(updateBrazeJobStub);
  });
});
