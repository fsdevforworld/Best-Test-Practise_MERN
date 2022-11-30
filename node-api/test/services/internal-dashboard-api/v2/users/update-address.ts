import { expect } from 'chai';
import * as sinon from 'sinon';
import * as request from 'supertest';
import factory from '../../../../factories';
import {
  clean,
  createInternalUser,
  stubUserUpdateBroadcasts,
  withInternalUser,
} from '../../../../test-helpers';
import {
  DashboardActionLog,
  DashboardActionReason,
  DashboardUserModification,
  InternalUser,
  User,
} from '../../../../../src/models';
import app from '../../../../../src/services/internal-dashboard-api';
import { ActionCode } from '../../../../../src/services/internal-dashboard-api/domain/action-log';
import { AnalyticsEvent } from '../../../../../src/typings';

describe('PATCH /v2/users/:id/address', () => {
  const sandbox = sinon.createSandbox();
  const actionCode = ActionCode.UserAddressChange;
  const stubs: { [key: string]: sinon.SinonStub } = {};
  let user: User;
  let agent: InternalUser;
  let dashboardAction;
  let dashboardActionReason: DashboardActionReason;
  let response: request.Response;

  const updateAddressPayload = {
    addressLine1: '1265 S Cochran Ave',
    addressLine2: 'The Pit',
    city: 'Los Angeles',
    state: 'CA',
    zipCode: '90019',
  };

  const actionLogPayload = {
    zendeskTicketUrl: 'zende.sk',
    note: 'nimbus',
  };

  before(async () => {
    await clean();

    const broadcastStubs = stubUserUpdateBroadcasts(sandbox);
    Object.assign(stubs, broadcastStubs);

    [user, agent] = await Promise.all([factory.create<User>('user'), createInternalUser()]);

    dashboardAction = await factory.create('dashboard-action', {
      code: actionCode,
    });
    dashboardActionReason = await factory.create('dashboard-action-reason', {
      dashboardActionId: dashboardAction.id,
    });
  });

  after(() => clean(sandbox));

  context('a valid update request', () => {
    before(async () => {
      const req = request(app)
        .patch(`/v2/users/${user.id}/address`)
        .send({
          ...updateAddressPayload,
          dashboardActionReasonId: dashboardActionReason.id,
          ...actionLogPayload,
        })
        .expect(200);

      response = await withInternalUser(req, agent);
    });

    it('responds with the updated address', () => {
      const {
        body: {
          data: { attributes },
        },
      } = response;

      Object.entries(updateAddressPayload).forEach(([field, value]) => {
        expect(attributes[field]).to.equal(value, field);
      });
    });

    it('saves the updated fields in the db', async () => {
      await user.reload();

      Object.entries(updateAddressPayload).forEach(([field, value]) => {
        expect(user.get(field)).to.equal(value, field);
      });
    });

    it('creates an action log and dashboard user modification', async () => {
      const actionLog = await DashboardActionLog.findOne({
        where: { dashboardActionReasonId: dashboardActionReason.id, internalUserId: agent.id },
        rejectOnEmpty: true,
      });

      expect(actionLog.note).to.equal(actionLogPayload.note);
      expect(actionLog.zendeskTicketUrl).to.equal(actionLogPayload.zendeskTicketUrl);

      const modification = await DashboardUserModification.findOne({
        where: {
          dashboardActionLogId: actionLog.id,
        },
        rejectOnEmpty: true,
      });

      Object.entries(updateAddressPayload).forEach(([field, value]) => {
        expect(modification.modification[field].currentValue).to.equal(value, field);
      });
    });

    it('broadcasts the changes', () => {
      sinon.assert.calledWithExactly(stubs.publishUserUpdatedEventStub, {
        addressChanged: true,
        userId: user.id,
      });

      sinon.assert.calledWithExactly(stubs.updateSynapsepayUserTaskStub, {
        userId: user.id,
        options: {
          fields: {
            ...updateAddressPayload,
            birthdate: undefined,
            firstName: undefined,
            lastName: undefined,
            license: undefined,
          },
        },
      });

      sinon.assert.calledWithExactly(stubs.updateBrazeTaskStub, {
        userId: user.id,
        attributes: { city: updateAddressPayload.city, country: 'US' },
        eventProperties: [{ name: AnalyticsEvent.AddressUpdated }],
      });
    });
  });
});
