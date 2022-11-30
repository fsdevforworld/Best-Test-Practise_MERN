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
  DashboardAction,
  DashboardActionLog,
  DashboardActionReason,
  DashboardUserModification,
  User,
} from '../../../../../src/models';
import { AnalyticsEvent, IDashboardModification } from '../../../../../src/typings';
import { ActionCode } from '../../../../../src/services/internal-dashboard-api/domain/action-log';

describe('PATCH /v2/users/:id/phone-number', () => {
  const sandbox = sinon.createSandbox();
  const stubs: { [key: string]: sinon.SinonStub } = {};

  const updatePhoneNumberCode = ActionCode.UserPhoneNumberChange;

  before(() => clean());

  beforeEach(() => {
    const broadcastStubs = stubUserUpdateBroadcasts(sandbox);
    Object.assign(stubs, broadcastStubs);
  });

  afterEach(() => clean(sandbox));

  describe('happy path', async () => {
    let user: User;
    let dashboardAction: DashboardAction;
    let dashboardActionReason: DashboardActionReason;
    let req: request.Test;

    const newPhoneNumber = '+13108675309';

    beforeEach(async () => {
      user = await factory.create<User>('user', { phoneNumber: '+1234567890' });

      dashboardAction = await factory.create('dashboard-action', {
        code: updatePhoneNumberCode,
      });
      dashboardActionReason = await factory.create('dashboard-action-reason', {
        dashboardActionId: dashboardAction.id,
      });

      req = request(app)
        .patch(`/v2/users/${user.id}/phone-number`)
        .send({
          phoneNumber: newPhoneNumber,
          dashboardActionReasonId: dashboardActionReason.id,
          zendeskTicketUrl: 'zende.sk',
          note: 'nimbus',
        })
        .expect(200);
    });

    it('should update phone number', async () => {
      const {
        body: {
          data: {
            attributes: { phoneNumber },
          },
        },
      } = await withInternalUser(req);

      expect(phoneNumber).to.equal(newPhoneNumber);
    });

    it('should preserve any `-...` suffix', async () => {
      const newDeletedNumber = `${newPhoneNumber}-deleted-1234`;

      const deletedUserReq = request(app)
        .patch(`/v2/users/${user.id}/phone-number`)
        .send({
          phoneNumber: newDeletedNumber,
          dashboardActionReasonId: dashboardActionReason.id,
          zendeskTicketUrl: 'zende.sk',
          note: 'nimbus',
        })
        .expect(200);

      const {
        body: {
          data: {
            attributes: { phoneNumber },
          },
        },
      } = await withInternalUser(deletedUserReq);

      expect(phoneNumber).to.equal(newDeletedNumber);
    });

    it('should create dashboard action log and user modification', async () => {
      const agent = await createInternalUser();

      const expectedModification: IDashboardModification = {
        phoneNumber: {
          previousValue: user.phoneNumber,
          currentValue: newPhoneNumber,
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
        phoneChanged: true,
        userId: user.id,
      });

      sinon.assert.calledWithExactly(stubs.updateSynapsepayUserTaskStub, {
        userId: user.id,
      });

      sinon.assert.calledWithExactly(stubs.updateBrazeTaskStub, {
        userId: user.id,
        attributes: { phoneNumber: newPhoneNumber },
        eventProperties: [{ name: AnalyticsEvent.PhoneNumberUpdated }],
      });
    });
  });

  describe('sad path', () => {
    let user: User;
    let req: request.Test;

    beforeEach(async () => {
      user = await factory.create<User>('user', { phoneNumber: '+1234567890' });

      req = request(app).patch(`/v2/users/${user.id}/phone-number`);
    });

    it('should throw if dashboard action code does not match', async () => {
      const dashboardActionReason = await factory.create('dashboard-action-reason');

      req = req
        .send({
          phoneNumber: '+13108675309',
          dashboardActionReasonId: dashboardActionReason.id,
          zendeskTicketUrl: 'zende.sk',
        })
        .expect(400);

      const res = await withInternalUser(req);

      expect(res.body.message).to.include(
        `Dashboard action reason provided does not correspond to the "${updatePhoneNumberCode}" dashboard action`,
      );

      sinon.assert.notCalled(stubs.publishUserUpdatedEventStub);
      sinon.assert.notCalled(stubs.updateSynapsepayUserTaskStub);
      sinon.assert.notCalled(stubs.updateBrazeTaskStub);
    });

    it('should throw if phone number is not valid pattern', async () => {
      const dashboardAction = await factory.create('dashboard-action', {
        code: updatePhoneNumberCode,
      });
      const dashboardActionReason = await factory.create('dashboard-action-reason', {
        dashboardActionId: dashboardAction.id,
      });

      req = req
        .send({
          phoneNumber: '1234567890',
          dashboardActionReasonId: dashboardActionReason.id,
          zendeskTicketUrl: 'zende.sk',
        })
        .expect(400);

      const res = await withInternalUser(req);

      expect(res.body.message).to.include('Phone number must be a valid E164-formatted US number');

      sinon.assert.notCalled(stubs.publishUserUpdatedEventStub);
      sinon.assert.notCalled(stubs.updateSynapsepayUserTaskStub);
      sinon.assert.notCalled(stubs.updateBrazeTaskStub);
    });

    it('responds with a ConflictError if the phone number is already in use', async () => {
      const otherUser = await factory.create('user');
      const dashboardAction = await factory.create('dashboard-action', {
        code: updatePhoneNumberCode,
      });
      const dashboardActionReason = await factory.create('dashboard-action-reason', {
        dashboardActionId: dashboardAction.id,
      });

      await withInternalUser(
        req
          .send({
            phoneNumber: otherUser.phoneNumber,
            dashboardActionReasonId: dashboardActionReason.id,
            zendeskTicketUrl: 'zende.sk',
            note: 'nimbus',
          })
          .expect(409),
      );
    });
  });
});
