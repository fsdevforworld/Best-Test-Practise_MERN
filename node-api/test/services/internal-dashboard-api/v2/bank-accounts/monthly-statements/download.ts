import * as request from 'supertest';
import { expect } from 'chai';
import app from '../../../../../../src/services/internal-dashboard-api';
import {
  clean,
  withInternalUser,
  replayHttp,
  seedDashboardAction,
} from '../../../../../test-helpers';
import factory from '../../../../../factories';
import {
  User,
  BankAccount,
  DashboardActionReason,
  BankConnection,
  DashboardActionLogMonthlyStatement,
} from '../../../../../../src/models';
import { BankingDataSource } from '@dave-inc/wire-typings';
import { ActionCode } from '../../../../../../src/services/internal-dashboard-api/domain/action-log';

const fixtureDir = 'services/internal-dashboard-api/v2/bank-accounts/monthly-statements/download';

describe('POST /v2/bank-accounts/:bankAccountId/monthly-statements/:id/download', () => {
  const userId = 5032;
  const externalBankAccountId = 'b1dd6b3084fa11ea93125b5d6cfae18d';
  const statementId = '6435c868161449d0bfeee69e504ec1a3';

  let req: request.Test;
  let bankAccount: BankAccount;
  let dashboardActionReason: DashboardActionReason;
  let payload: object;

  beforeEach(async () => {
    await clean();
    await factory.create<User>('user', { id: userId });

    const bankConnection = await factory.create<BankConnection>('bank-connection', {
      userId,
      bankingDataSource: BankingDataSource.BankOfDave,
    });

    [{ dashboardActionReason }, bankAccount] = await Promise.all([
      seedDashboardAction(ActionCode.DownloadMonthlyStatement),
      factory.create<BankAccount>('bank-account', {
        userId,
        bankConnectionId: bankConnection.id,
        externalId: externalBankAccountId,
      }),
    ]);

    payload = {
      dashboardActionReasonId: dashboardActionReason.id,
      zendeskTicketUrl: 'zende.sk',
      note: 'Other',
    };

    req = request(app)
      .post(`/v2/bank-accounts/${bankAccount.id}/monthly-statements/${statementId}/download`)
      .send(payload);
  });

  it('responds with a 405 when the banking data source is not Dave Banking', async () => {
    await BankConnection.update(
      { bankingDataSource: BankingDataSource.Plaid },
      {
        where: {
          userId,
        },
      },
    );

    await withInternalUser(req.expect(405));
  });

  it(
    'sends the statement',
    replayHttp(`${fixtureDir}/success.json`, async () => {
      const { header } = await withInternalUser(req.expect(200));

      expect(header['content-type']).to.equal('application/pdf');
      expect(header['access-control-expose-headers']).to.equal('Content-Disposition');
      expect(header['content-disposition']).to.equal(
        'attachment; filename="Dave Banking Statement for September 2020.pdf"',
      );
    }),
  );

  it(
    'creates an action log',
    replayHttp(`${fixtureDir}/success.json`, async () => {
      await withInternalUser(req.expect(200));

      const { dashboardActionLog } = await DashboardActionLogMonthlyStatement.scope(
        'withActionLog',
      ).findOne({
        where: { statementId },
      });

      expect(dashboardActionLog.dashboardActionReasonId).to.equal(dashboardActionReason.id);
    }),
  );

  it(
    'sends a 404 when there is no statement found',
    replayHttp(`${fixtureDir}/not-found.json`, async () => {
      await withInternalUser(
        request(app)
          .post(`/v2/bank-accounts/${bankAccount.id}/monthly-statements/1`)
          .send(payload)
          .expect(404),
      );
    }),
  );
});
