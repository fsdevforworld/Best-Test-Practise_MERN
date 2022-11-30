import * as sinon from 'sinon';
import { expect } from 'chai';
import * as request from 'supertest';
import app from '../../../../../src/services/internal-dashboard-api';
import {
  clean,
  stubLoomisClient,
  stubTivanClient,
  withInternalUser,
} from '../../../../test-helpers';
import factory from '../../../../factories';
import {
  Advance,
  DashboardAction,
  DashboardActionReason,
  DashboardAdvanceRepayment,
  PaymentMethod,
  User,
} from '../../../../../src/models';
import { ActionCode } from '../../../../../src/services/internal-dashboard-api/domain/action-log';
import { ExternalTransactionStatus } from '@dave-inc/wire-typings';

const url = '/v2/dashboard-advance-repayments';

describe(`POST ${url}`, () => {
  const sandbox = sinon.createSandbox();

  before(() => clean(sandbox));

  afterEach(() => clean(sandbox));

  let advance: Advance;
  let actionReason: DashboardActionReason;
  let debitCard: PaymentMethod;
  let requestParams: object;
  beforeEach(async () => {
    stubLoomisClient(sandbox);
    stubTivanClient(sandbox);

    const [user, action] = await Promise.all([
      factory.create<User>('user'),
      factory.create<DashboardAction>('dashboard-action', {
        code: ActionCode.CreateAdvanceRepayment,
      }),
    ]);

    [advance, actionReason, debitCard] = await Promise.all([
      factory.create<Advance>('advance', {
        outstanding: 75,
        userId: user.id,
        disbursementStatus: ExternalTransactionStatus.Completed,
      }),
      factory.create<DashboardActionReason>('dashboard-action-reason', {
        dashboardActionId: action.id,
      }),
      factory.create<PaymentMethod>('payment-method', { userId: user.id }),
    ]);

    requestParams = {
      advanceId: advance.id,
      paymentMethodUniversalId: `DEBIT:${debitCard.id}`,
      amount: advance.outstanding,
      dashboardActionReasonId: actionReason.id,
      zendeskTicketUrl: 'foo',
    };
  });

  it('creates and responds with a dashboard-advance-repayment', async () => {
    const res = await withInternalUser(
      request(app)
        .post(url)
        .send(requestParams)
        .expect(200),
    );

    const advanceRepayment = await DashboardAdvanceRepayment.findOne({
      where: { advanceId: advance.id },
    });

    const {
      data: { id, type, attributes, relationships },
    } = res.body;

    expect(type).to.equal('dashboard-advance-repayment');
    expect(id).to.equal(advanceRepayment.tivanTaskId);
    expect(attributes.status).to.equal(advanceRepayment.status);
    expect(relationships.advance).to.deep.equal({ data: { id: `${advance.id}`, type: 'advance' } });
  });

  it('responds with an error when the amount is more than the outstanding balance', async () => {
    await advance.update({ outstanding: 25 });

    await withInternalUser(
      request(app)
        .post(url)
        .send({ ...requestParams, amount: 25.01 })
        .expect(400),
    );
  });

  ['PENDING', 'UNKNOWN', 'RETURNED', 'CANCELED', 'NOTDISBURSED'].forEach(status => {
    it(`responds with an error when the disbursement status is ${status}`, async () => {
      await advance.update({ disbursementStatus: status });

      await withInternalUser(
        request(app)
          .post(url)
          .send(requestParams)
          .expect(400),
      );
    });
  });
});
