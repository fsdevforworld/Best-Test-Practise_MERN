import 'mocha';
import { expect } from 'chai';
import * as sinon from 'sinon';
import { moment } from '@dave-inc/time-lib';

import { clean } from '../test-helpers';
import factory from '../factories';
import { AdminComment, Advance, AuditLog, Payment } from '../../src/models';
import * as Jobs from '../../src/jobs/data';

import {
  updatePaymentRow,
  ProcessingResult,
} from '../../bin/scripts/fpt-979-update-payment-status';
import { ExternalTransactionStatus } from '@dave-inc/wire-typings';

describe('bin/scripts/fpt-979-update-payment-status', () => {
  const sandbox = sinon.createSandbox();
  let adminCommentStub: sinon.SinonStub;

  beforeEach(async () => {
    await clean(sandbox);
    adminCommentStub = sandbox.stub(AdminComment, 'create');
    sandbox.stub(Jobs, 'broadcastPaymentChangedTask').resolves();
  });

  after(async () => {
    await clean(sandbox);
  });

  it('should update payment status', async () => {
    const advance = await factory.create<Advance>('advance', {
      amount: 50,
      outstanding: 0,
    });
    await factory.create('advance-tip', {
      advanceId: advance.id,
      amount: 0,
      percent: 0,
    });
    await factory.create<Payment>('payment', {
      advanceId: advance.id,
      amount: 20,
      status: ExternalTransactionStatus.Completed,
    });
    const payment = await factory.create<Payment>('payment', {
      advanceId: advance.id,
      amount: 30,
      status: ExternalTransactionStatus.Completed,
    });

    const result = await updatePaymentRow(
      payment.id,
      ExternalTransactionStatus.Completed,
      ExternalTransactionStatus.Returned,
      moment(),
    );

    expect(result).to.equal(ProcessingResult.Success);

    await payment.reload();
    expect(payment.status).to.equal(ExternalTransactionStatus.Returned);

    await advance.reload();
    expect(advance.outstanding).to.equal(30);
  });

  it('should AuditLog and AdminComment', async () => {
    const advance = await factory.create<Advance>('advance', {
      amount: 50,
      outstanding: 0,
    });
    await factory.create('advance-tip', {
      advanceId: advance.id,
      amount: 0,
      percent: 0,
    });
    const payment = await factory.create<Payment>('payment', {
      advanceId: advance.id,
      amount: 50,
      status: ExternalTransactionStatus.Completed,
    });

    await updatePaymentRow(
      payment.id,
      ExternalTransactionStatus.Completed,
      ExternalTransactionStatus.Returned,
      moment(),
    );

    const auditLogs = await AuditLog.findAll({
      where: {
        eventUuid: payment.id,
        type: 'SYNAPSE_RETURN_STATUS_SYNC',
      },
    });

    expect(auditLogs.length).to.equal(1);

    expect(adminCommentStub.callCount).to.equal(1);
  });

  it('should find and mark newly taken advances', async () => {
    const advance = await factory.create<Advance>('advance', {
      amount: 50,
      outstanding: 0,
    });

    const tip = await factory.create('advance-tip', {
      advanceId: advance.id,
      amount: 0,
      percent: 0,
    });
    const payment = await factory.create<Payment>('payment', {
      advanceId: advance.id,
      amount: 50,
      status: ExternalTransactionStatus.Completed,
    });

    // to stub Advance.findAll we also need to stub findByPk
    sandbox.stub(Advance, 'findByPk').resolves(advance);

    const newAdvance0 = factory.build<Advance>('advance', {
      amount: 75,
      outstanding: 75,
    });
    const newAdvance1 = factory.build<Advance>('advance', {
      amount: 75,
      outstanding: 75,
      getAdvanceTip: () => tip,
    });
    sandbox.stub(Advance, 'findAll').resolves([newAdvance0, newAdvance1]);

    await updatePaymentRow(
      payment.id,
      ExternalTransactionStatus.Completed,
      ExternalTransactionStatus.Returned,
      moment(),
    );

    const auditLogs = await AuditLog.findAll({
      where: {
        type: 'SYNAPSE_RETURN_STATUS_NEW_ADVANCE_TAKEN',
      },
    });

    expect(auditLogs.length).to.equal(2);

    expect(adminCommentStub.callCount).to.equal(3);
  });
});
