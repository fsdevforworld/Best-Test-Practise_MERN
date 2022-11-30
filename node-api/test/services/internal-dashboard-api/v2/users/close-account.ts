import * as request from 'supertest';
import * as SynapsepayLib from '../../../../../src/domain/synapsepay';
import * as sinon from 'sinon';
import app from '../../../../../src/services/internal-dashboard-api';
import { expect } from 'chai';
import { clean, createInternalUser, withInternalUser } from '../../../../test-helpers';
import factory from '../../../../factories';
import {
  DashboardAction,
  DashboardActionLog,
  DashboardActionLogDeleteRequest,
  DashboardActionReason,
  DeleteRequest,
  User,
} from '../../../../../src/models';
import {
  ActionCode,
  ActionLogPayload,
} from '../../../../../src/services/internal-dashboard-api/domain/action-log';
import { IApiResourceObject } from 'src/typings';
import { synapsepaySerializers } from '../../serializers';
import { moment } from '@dave-inc/time-lib';
import { ACTIVE_TIMESTAMP } from '../../../../../src/lib/sequelize';

describe('POST /v2/users/:id/close-account', () => {
  before(() => clean());

  afterEach(() => clean());

  describe('happy path', () => {
    const sandbox = sinon.createSandbox();

    let user: User;
    let dashboardAction: DashboardAction;
    let dashboardActionReason: DashboardActionReason;
    let req: request.Test;
    let actionLogPayload: ActionLogPayload;

    beforeEach(async () => {
      [user, dashboardAction] = await Promise.all([
        factory.create('subscribed-user'),
        factory.create('dashboard-action', {
          code: ActionCode.CloseAccount,
        }),
      ]);

      sandbox.stub(SynapsepayLib, 'deleteSynapsePayUser').resolves();

      await factory.create('synapsepay-document', { userId: user.id });

      dashboardActionReason = await factory.create('dashboard-action-reason', {
        dashboardActionId: dashboardAction.id,
        reason: 'big time fraud',
      });

      actionLogPayload = {
        dashboardActionReasonId: dashboardActionReason.id,
        zendeskTicketUrl: 'pirat.es',
        note: 'but you have heard of me',
      };

      req = request(app)
        .post(`/v2/users/${user.id}/close-account`)
        .send({
          ...actionLogPayload,
          waiveCoolOff: false,
        })
        .expect(200);
    });

    afterEach(() => clean(sandbox));

    it('should create action log and join table entry', async () => {
      const agent = await createInternalUser();

      await withInternalUser(req, agent);

      const deleteRequest = await DeleteRequest.findOne({
        where: { userId: user.id },
      });
      const actionLogDeleteRequest = await DashboardActionLogDeleteRequest.findOne({
        where: { deleteRequestId: deleteRequest.id },
      });
      const actionLog = await DashboardActionLog.findByPk(
        actionLogDeleteRequest.dashboardActionLogId,
      );

      expect(actionLog).to.exist;
      expect(actionLog.internalUserId).to.eq(agent.id);
      expect(actionLog.dashboardActionReasonId).to.eq(dashboardActionReason.id);
      expect(actionLog.zendeskTicketUrl).to.eq('pirat.es');
      expect(actionLog.note).to.eq('but you have heard of me');
    });

    it('should respond with deleted synapsepay docs', async () => {
      const {
        body: { included },
      } = await withInternalUser(req);

      const docs: synapsepaySerializers.ISynapsepayDocumentResource[] = included.filter(
        (object: IApiResourceObject) => object.type === 'synapsepay-document',
      );

      expect(docs).has.length(1);
      expect(moment(docs[0].attributes.deleted).isBefore(moment(ACTIVE_TIMESTAMP))).to.be.true;
    });

    it('should soft delete user', async () => {
      await withInternalUser(req);

      await user.reload({ paranoid: false });
      expect(user.isSoftDeleted()).to.be.true;
      expect(user.phoneNumber).to.include('-deleted-');
      expect(user.overrideSixtyDayDelete).to.be.false;
    });

    it('should set overrideSixtyDayDelete when waiveCoolOff is true', async () => {
      req = request(app)
        .post(`/v2/users/${user.id}/close-account`)
        .send({
          ...actionLogPayload,
          waiveCoolOff: true,
        })
        .expect(200);

      await withInternalUser(req);

      await user.reload({ paranoid: false });

      expect(user.overrideSixtyDayDelete).to.be.true;
    });

    it('should throw a conflict error if user has a dave banking connection', async () => {
      await factory.create('bank-of-dave-bank-connection', { userId: user.id });

      req = request(app)
        .post(`/v2/users/${user.id}/close-account`)
        .send({ ...actionLogPayload, waiveCoolOff: false })
        .expect(409);

      const response = await withInternalUser(req);

      expect(response.body.message).to.contain('User cannot be deleted.');
    });
  });
});
