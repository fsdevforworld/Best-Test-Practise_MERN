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
import { moment } from '@dave-inc/time-lib';
import { IDashboardModification } from '../../../../../src/typings';
import { ActionCode } from '../../../../../src/services/internal-dashboard-api/domain/action-log';

describe('PATCH /v2/users/:userId/birthdate', () => {
  const sandbox = sinon.createSandbox();

  let updateBrazeJobStub: sinon.SinonStub;
  let updateSynapseJobTask: sinon.SinonStub;

  before(() => clean());

  beforeEach(() => {
    updateBrazeJobStub = sandbox.stub(Jobs, 'updateBrazeTask');
    updateSynapseJobTask = sandbox.stub(Jobs, 'updateSynapsepayUserTask').resolves();
  });

  afterEach(() => clean(sandbox));

  describe('happy path', async () => {
    let user: User;
    let dashboardAction;
    let dashboardActionReason: DashboardActionReason;
    let req: request.Test;

    const oldBirthdate = moment('1984-01-01');
    const newBirthdate = moment('2002-10-15');

    beforeEach(async () => {
      user = await factory.create<User>('user', { birthdate: oldBirthdate });

      dashboardAction = await factory.create('dashboard-action', {
        code: ActionCode.UserBirthdateChange,
      });
      dashboardActionReason = await factory.create('dashboard-action-reason', {
        dashboardActionId: dashboardAction.id,
      });

      req = request(app)
        .patch(`/v2/users/${user.id}/birthdate`)
        .send({
          birthdate: newBirthdate.format('YYYY-MM-DD'),
          dashboardActionReasonId: dashboardActionReason.id,
          zendeskTicketUrl: 'zende.sk',
          note: 'note',
        })
        .expect(200);
    });

    it('should return user with updated birthdate', async () => {
      const {
        body: {
          data: {
            attributes: { birthdate },
          },
        },
      } = await withInternalUser(req);

      expect(birthdate).to.equal(newBirthdate.format('YYYY-MM-DD'));
    });

    it('should create dashboard action log and user modification', async () => {
      const agent = await createInternalUser();

      const expectedModification: IDashboardModification = {
        birthdate: {
          previousValue: oldBirthdate.format('YYYY-MM-DD'),
          currentValue: newBirthdate.format('YYYY-MM-DD'),
        },
      };

      await withInternalUser(req, agent);

      const actionLog = await DashboardActionLog.findOne({
        where: { dashboardActionReasonId: dashboardActionReason.id, internalUserId: agent.id },
      });

      expect(actionLog.note).to.eq('note');
      expect(actionLog.zendeskTicketUrl).to.eq('zende.sk');

      const userModification = await DashboardUserModification.findOne({
        where: { dashboardActionLogId: actionLog.id },
      });

      expect(userModification.modification).to.eql(expectedModification);
    });

    it('should broadcast changes', async () => {
      await withInternalUser(req);

      sinon.assert.calledWithExactly(updateSynapseJobTask, {
        userId: user.id,
        options: {
          fields: {
            addressLine1: undefined,
            addressLine2: undefined,
            birthdate: newBirthdate.format('YYYY-MM-DD'),
            city: undefined,
            firstName: undefined,
            lastName: undefined,
            license: undefined,
            state: undefined,
            zipCode: undefined,
          },
        },
      });

      sinon.assert.calledWithExactly(updateBrazeJobStub, {
        userId: user.id,
        attributes: { birthdate: newBirthdate.format('YYYY-MM-DD') },
        eventProperties: [],
      });
    });
  });

  it('should throw if dashboard action code does not match', async () => {
    const dashboardActionReason = await factory.create('dashboard-action-reason');
    const user = await factory.create('user');

    const req = request(app)
      .patch(`/v2/users/${user.id}/birthdate`)
      .send({
        birthdate: moment('1960-01-01'),
        dashboardActionReasonId: dashboardActionReason.id,
        zendeskTicketUrl: 'zende.sk',
      })
      .expect(400);

    const res = await withInternalUser(req);

    expect(res.body.message).to.include(
      `Dashboard action reason provided does not correspond to the "${ActionCode.UserBirthdateChange}" dashboard action`,
    );

    sinon.assert.notCalled(updateSynapseJobTask);
    sinon.assert.notCalled(updateBrazeJobStub);
  });

  it('should throw if birthdate is not old enough', async () => {
    const dashboardAction = await factory.create('dashboard-action', {
      code: ActionCode.UserBirthdateChange,
    });
    const dashboardActionReason = await factory.create('dashboard-action-reason', {
      dashboardActionId: dashboardAction.id,
    });
    const user = await factory.create('user');

    const req = request(app)
      .patch(`/v2/users/${user.id}/birthdate`)
      .send({
        birthdate: moment().subtract(1, 'year'),
        dashboardActionReasonId: dashboardActionReason.id,
        zendeskTicketUrl: 'zende.sk',
      })
      .expect(400);

    const res = await withInternalUser(req);

    expect(res.body.message).to.include('Invalid birthdate: user must be at least 18 years old');

    sinon.assert.notCalled(updateSynapseJobTask);
    sinon.assert.notCalled(updateBrazeJobStub);
  });
});
