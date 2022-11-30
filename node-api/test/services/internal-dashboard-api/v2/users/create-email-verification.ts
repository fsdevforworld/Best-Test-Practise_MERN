import * as request from 'supertest';
import app from '../../../../../src/services/internal-dashboard-api';
import { expect } from 'chai';
import { clean, createInternalUser, withInternalUser } from '../../../../test-helpers';
import factory from '../../../../factories';
import {
  DashboardAction,
  DashboardActionReason,
  EmailVerification,
  User,
} from '../../../../../src/models';
import * as sinon from 'sinon';
import sendgrid from '../../../../../src/lib/sendgrid';
import * as Jobs from '../../../../../src/jobs/data';
import { moment } from '@dave-inc/time-lib';
import { AnalyticsEvent } from '../../../../../src/typings';
import { ActionCode } from '../../../../../src/services/internal-dashboard-api/domain/action-log';

describe('POST /v2/users/:id/email-verifications', () => {
  const sandbox = sinon.createSandbox();

  let updateBrazeJobStub: sinon.SinonStub;

  before(() => clean());

  beforeEach(() => {
    updateBrazeJobStub = sandbox.stub(Jobs, 'updateBrazeTask');
    sandbox.stub(sendgrid, 'send').resolves();
  });

  afterEach(() => clean(sandbox));

  describe('happy path', () => {
    let user: User;
    let dashboardAction: DashboardAction;
    let dashboardActionReason: DashboardActionReason;
    let req: request.Test;

    beforeEach(async () => {
      [user, dashboardAction] = await Promise.all([
        factory.create('user'),
        factory.create('dashboard-action', {
          code: ActionCode.CreateEmailVerification,
        }),
      ]);

      dashboardActionReason = await factory.create('dashboard-action-reason', {
        dashboardActionId: dashboardAction.id,
      });

      req = request(app).post(`/v2/users/${user.id}/email-verifications`);
    });

    it('should create email verification', async () => {
      const agent = await createInternalUser();

      req = req
        .send({
          email: 'doug@judy.com',
          dashboardActionReasonId: dashboardActionReason.id,
          zendeskTicketUrl: 'zende.sk',
          note: 'rosa rosa rooooosaa',
        })
        .expect(200);

      const {
        body: { data: verificationResponse },
      } = await withInternalUser(req, agent);

      const createdVerification = await EmailVerification.findOne({
        where: { userId: user.id, email: 'doug@judy.com' },
      });

      expect(createdVerification).to.exist;
      expect(createdVerification.verified).to.be.null;

      expect(verificationResponse.id).to.equal(`${createdVerification.id}`);
      expect(verificationResponse.type).to.equal('email-verification');

      const { attributes } = verificationResponse;
      const expectedAttributes = {
        userId: user.id,
        email: 'doug@judy.com',
        verified: null as string,
        created: moment(createdVerification.created).format(),
        updated: moment(createdVerification.updated).format(),
      };

      expect(attributes).to.deep.eq(expectedAttributes);
    });

    it('should broadcast change', async () => {
      req = req
        .send({
          email: 'doug@judy.com',
          dashboardActionReasonId: dashboardActionReason.id,
          zendeskTicketUrl: 'zende.sk',
          note: 'rosa rosa rooooosaa',
        })
        .expect(200);

      await withInternalUser(req);

      sinon.assert.calledWithExactly(updateBrazeJobStub, {
        userId: user.id,
        attributes: { email_verified: false, unverified_email: 'doug@judy.com' },
        eventProperties: {
          name: AnalyticsEvent.EmailUnverified,
          properties: {
            obfuscatedEmail: 'd****g@judy.com',
            unverifiedEmail: 'doug@judy.com',
            sendEmail: true,
            url: sinon.match.string,
          },
        },
      });
    });

    it('should throw if email does not match format', async () => {
      req = req
        .send({
          email: '$$@$$.co',
          dashboardActionReasonId: dashboardActionReason.id,
          zendeskTicketUrl: 'zende.sk',
          note: 'rosa rosa rooooosaa',
        })
        .expect(400);

      const res = await withInternalUser(req);
      expect(res.body.message).to.contain('Invalid email: email is incorrectly formatted');
    });

    it('should throw if email is a duplicate', async () => {
      await factory.create('user', { email: 'doug@judy.com' });

      req = req
        .send({
          email: 'doug@judy.com',
          dashboardActionReasonId: dashboardActionReason.id,
          zendeskTicketUrl: 'zende.sk',
          note: 'rosa rosa rooooosaa',
        })
        .expect(409);

      const res = await withInternalUser(req);
      expect(res.body.message).to.contain(
        'A user with this email already exists, please enter a different email.',
      );
    });
  });
});
