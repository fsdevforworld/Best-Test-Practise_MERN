import {
  clean,
  stubBalanceLogClient,
  stubBankTransactionClient,
  stubLoomisClient,
  stubUnderwritingML,
  withInternalUser,
} from '../../../../test-helpers';
import * as sinon from 'sinon';
import factory from '../../../../factories';
import {
  DashboardAction,
  DashboardActionLog,
  DashboardActionReason,
  DashboardAdvanceApproval,
  User,
} from '../../../../../src/models';
import * as request from 'supertest';
import { ActionCode } from '../../../../../src/services/internal-dashboard-api/domain/action-log';
import app from '../../../../../src/services/internal-dashboard-api';
import { BankAccount } from '@dave-inc/loomis-client';
import { expect } from 'chai';
import { moment } from '@dave-inc/time-lib';
import { MicroDeposit } from '@dave-inc/wire-typings';
import AdvanceApprovalClient from '../../../../../src/lib/advance-approval-client';

const sandbox = sinon.createSandbox();

describe('POST /v2/advance-approvals', () => {
  before(() => clean());

  afterEach(() => clean(sandbox));

  let dashboardAction: DashboardAction;
  let dashboardActionReason: DashboardActionReason;

  beforeEach(async () => {
    stubLoomisClient(sandbox);
    stubBalanceLogClient(sandbox);
    stubBankTransactionClient(sandbox);
    stubUnderwritingML(sandbox, { error: new Error('No ML') });
    dashboardAction = await factory.create('dashboard-action', {
      code: ActionCode.RunApproval,
    });
    dashboardActionReason = await factory.create('dashboard-action-reason', {
      dashboardActionId: dashboardAction.id,
    });
  });

  describe('successful advance approval', () => {
    let req: request.Test;

    beforeEach(async () => {
      const user = await factory.create('user');
      const bankConnection = await factory.create('bank-connection', { userId: user.id });
      const bankAccount = await factory.create('bank-account', {
        userId: user.id,
        bankConnectionId: bankConnection.id,
        microDeposit: MicroDeposit.COMPLETED,
      });
      await factory.create('bank-transaction', {
        userId: user.id,
        bankAccountId: bankAccount.id,
        transactionDate: moment().subtract(90, 'days'),
      });
      const transactionParams =
        moment()
          .add(3, 'days')
          .date() >= 28
          ? -1
          : moment()
              .add(3, 'days')
              .date();
      await factory.create('recurring-transaction', {
        bankAccountId: bankAccount.id,
        userId: bankAccount.userId,
        transactionDisplayName: 'Paycheck 2',
        userAmount: 400,
        interval: 'MONTHLY',
        params: [transactionParams],
      });

      const approval = await factory.create('advance-approval');

      sandbox.stub(AdvanceApprovalClient, 'createAdvanceApproval').resolves([
        await factory.create('create-approval-success', {
          approvalId: approval.id,
          advanceApproval: approval,
        }),
      ]);

      req = request(app)
        .post(`/v2/advance-approvals`)
        .send({
          userId: user.id,
          bankAccountId: bankAccount.id,
          dashboardActionReasonId: dashboardActionReason.id,
        })
        .expect(200);
    });

    it('returns an approved serialized advance approval', async () => {
      const {
        body: { data },
      } = await withInternalUser(req);

      expect(data.attributes.approved).to.be.true;
      expect(data.attributes.approvedAmounts.length).to.be.greaterThan(0);
      expect(data.attributes.initiator).to.equal('agent');
      expect(data.attributes.created).to.be.a('string');
      expect(data.attributes.defaultPaybackDate).to.be.a('string');
    });

    it('creates dashboard action log and dashboard advance approval', async () => {
      await withInternalUser(req);

      const actionLog = await DashboardActionLog.findOne({
        where: { dashboardActionReasonId: dashboardActionReason.id },
      });

      expect(actionLog).to.exist;

      const advanceApproval = await DashboardAdvanceApproval.findOne({
        where: { dashboardActionLogId: actionLog.id },
      });

      expect(advanceApproval).to.exist;
    });
  });

  describe('failed advance approval', () => {
    let req: request.Test;
    let user: User;
    let bankAccount: BankAccount;

    beforeEach(async () => {
      user = await factory.create('user');
      const bankConnection = await factory.create('bank-connection', { userId: user.id });
      sandbox
        .stub(AdvanceApprovalClient, 'createAdvanceApproval')
        .resolves([await factory.create('create-approval-failure')]);

      bankAccount = await factory.create('bank-account', {
        userId: user.id,
        bankConnectionId: bankConnection.id,
      });
    });

    it('fails if bankAccountId not valid', async () => {
      req = request(app)
        .post(`/v2/advance-approvals`)
        .send({
          userId: user.id,
          bankAccountId: 9,
          dashboardActionReasonId: dashboardActionReason.id,
        })
        .expect(404);

      const response = await withInternalUser(req);

      expect(response.body.message).to.contain('Bank account not found');
    });

    it('fails if userId not valid', async () => {
      req = request(app)
        .post(`/v2/advance-approvals`)
        .send({
          userId: 9,
          bankAccountId: bankAccount.id,
          dashboardActionReasonId: dashboardActionReason.id,
        })
        .expect(404);

      const response = await withInternalUser(req);

      expect(response.body.message).to.contain('User not found');
    });

    it('returns rejected serialized advance approval', async () => {
      req = request(app)
        .post(`/v2/advance-approvals`)
        .send({
          userId: user.id,
          bankAccountId: bankAccount.id,
          dashboardActionReasonId: dashboardActionReason.id,
        })
        .expect(200);

      const {
        body: { data },
      } = await withInternalUser(req);

      expect(data.attributes.approved).to.be.false;
      expect(data.attributes.approvedAmounts).to.be.empty;
    });
  });
});
