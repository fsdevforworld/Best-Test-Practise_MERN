import { expect } from 'chai';
import * as sinon from 'sinon';
import * as request from 'supertest';
import { BankingDataSource } from '@dave-inc/wire-typings';
import app from '../../../../../src/services/internal-dashboard-api';
import { clean, withInternalUser } from '../../../../test-helpers';
import factory from '../../../../factories';
import {
  BankConnection,
  DashboardActionLog,
  DashboardActionLogBankConnection,
  DashboardActionReason,
} from '../../../../../src/models';
import * as LoomisDomain from '../../../../../src/services/loomis-api/domain/delete-bank-account';
import { ActionCode } from '../../../../../src/services/internal-dashboard-api/domain/action-log';

describe('POST /v2/bank-connections/:id/archive', () => {
  const sandbox = sinon.createSandbox();

  let bankConnection: BankConnection;
  let dashboardActionReason: DashboardActionReason;
  let req: request.Test;
  let stub: sinon.SinonStub;
  beforeEach(async () => {
    await clean(sandbox);

    stub = sandbox.stub(LoomisDomain, 'deleteBankConnection').resolves();
    bankConnection = await factory.create<BankConnection>('bank-connection', {
      bankingDataSource: BankingDataSource.Plaid,
    });

    const dashboardAction = await factory.create('dashboard-action', {
      code: ActionCode.ArchiveBankConnection,
    });

    dashboardActionReason = await factory.create('dashboard-action-reason', {
      dashboardActionId: dashboardAction.id,
    });

    req = request(app)
      .post(`/v2/bank-connections/${bankConnection.id}/archive`)
      .send({
        dashboardActionReasonId: dashboardActionReason.id,
        zendeskTicketUrl: '123',
        note: 'resolved',
      });
  });

  it('does not allow Dave Banking connections to be archived', async () => {
    await bankConnection.update({ bankingDataSource: BankingDataSource.BankOfDave });

    await withInternalUser(req.expect(400));
  });

  it('calls the deleteBankConnection domain method', async () => {
    await withInternalUser(req.expect(200));

    sinon.assert.calledOnce(stub);
  });

  it('creates an action log of the event', async () => {
    await withInternalUser(req.expect(200));

    const logs = await DashboardActionLogBankConnection.findAll({
      where: {
        bankConnectionId: bankConnection.id,
      },
      include: [{ model: DashboardActionLog.scope('withRelated') }],
    });

    expect(logs.length).to.equal(1);

    const dashboardActionLog = logs[0].dashboardActionLog;

    expect(dashboardActionLog.dashboardActionReason.dashboardAction.code).to.equal(
      ActionCode.ArchiveBankConnection,
    );

    expect(dashboardActionLog).to.exist;
    expect(dashboardActionLog.dashboardActionReasonId).to.equal(dashboardActionReason.id);
    expect(dashboardActionLog.zendeskTicketUrl).to.equal('123');
    expect(dashboardActionLog.note).to.equal('resolved');
  });
});
