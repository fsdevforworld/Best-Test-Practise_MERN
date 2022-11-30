import * as sinon from 'sinon';
import { expect } from 'chai';
import { AdvanceCollectionTrigger } from '../../../../../src/typings';
import { clean, stubTivanClient } from '../../../../test-helpers';
import factory from '../../../../factories';
import { create } from '../../../../../src/services/internal-dashboard-api/domain/advance-repayment';
import {
  Advance,
  DashboardActionReason,
  DashboardAdvanceRepayment,
  InternalUser,
} from '../../../../../src/models';
import { TivanProcess } from '../../../../../src/lib/tivan-client';

describe('Advance Repayment - create', () => {
  const sandbox = sinon.createSandbox();

  before(() => clean(sandbox));

  afterEach(() => clean(sandbox));

  let advanceRepayment: DashboardAdvanceRepayment;
  let advance: Advance;
  let actionReason: DashboardActionReason;
  let internalUser: InternalUser;
  let repaymentStub: sinon.SinonSpy;
  beforeEach(async () => {
    [advance, actionReason, internalUser] = await Promise.all([
      factory.create<Advance>('advance'),
      factory.create<DashboardActionReason>('dashboard-action-reason'),
      factory.create<InternalUser>('internal-user'),
    ]);

    const actionLog = {
      dashboardActionReasonId: actionReason.id,
      internalUserId: internalUser.id,
      zendeskTicketUrl: 'foo',
    };

    repaymentStub = stubTivanClient(sandbox).createTask;

    advanceRepayment = await create({
      advance,
      actionLog,
      amount: 0.1,
      paymentMethodUniversalId: 'DEBIT:123',
    });
  });

  it('creates a dashboard advance repayment record', async () => {
    await advanceRepayment.reload();

    expect(advanceRepayment.status).to.equal('PENDING');
    expect(advanceRepayment.advanceId).to.equal(advance.id);
    expect(advanceRepayment.tivanTaskId).to.exist;
    expect(advanceRepayment.amount).to.equal(0.1);
    expect(advanceRepayment.paymentMethodUniversalId).to.equal('DEBIT:123');
  });

  it('creates an action log', async () => {
    const actionLog = await advanceRepayment.getDashboardActionLog();

    expect(actionLog.dashboardActionReasonId).to.equal(actionReason.id);
    expect(actionLog.internalUserId).to.equal(internalUser.id);
  });

  it('calls TivanClient.createTask', async () => {
    sinon.assert.calledOnce(repaymentStub);
    sinon.assert.calledWithMatch(
      repaymentStub,
      {
        process: TivanProcess.AdvanceWithPayment,
        userId: advance.userId,
        advanceId: advance.id,
        source: AdvanceCollectionTrigger.ADMIN_MANUAL_CREATION,
        payment: {
          paymentMethodId: advanceRepayment.paymentMethodUniversalId,
          amount: advanceRepayment.amount,
          disableFallback: true,
        },
      },
      { taskId: advanceRepayment.tivanTaskId, apiTask: true },
    );
  });
});
