import { expect } from 'chai';

import factory from '../../factories';
import { clean } from '../../test-helpers';
import { Advance, DashboardAdvanceModification, Reimbursement, User } from '../../../src/models';
import * as sinon from 'sinon';
import * as ReimbursementDomain from '../../../src/domain/reimbursement';
import { processAdvanceRefund } from '../../../src/domain/advance-refund';

const sandbox = sinon.createSandbox();

describe('processAdvanceRefund', () => {
  before(() => clean(sandbox));
  afterEach(() => clean(sandbox));

  let advance: Advance;
  let user: User;
  let reimbursement: Reimbursement;

  beforeEach(async () => {
    sandbox.stub(ReimbursementDomain, 'processReimbursement').resolves();

    user = await factory.create('user');
    advance = await factory.create('advance', {
      userId: user.id,
      amount: 50,
      fee: 5,
      outstanding: -50,
    });
    await factory.create('advance-tip', {
      advanceId: advance.id,
      amount: 5,
    });

    await factory.create('payment', {
      advanceId: advance.id,
      amount: 110,
      status: 'COMPLETED',
    });

    reimbursement = await factory.create('reimbursement', {
      advanceId: advance.id,
      userId: user.id,
      status: 'PENDING',
      amount: 60,
    });
    const advanceRefund = await factory.create('advance-refund', {
      advanceId: advance.id,
      reimbursementId: reimbursement.id,
    });
    await factory.create('advance-refund-line-item', {
      advanceRefundId: advanceRefund.id,
      amount: 50,
      adjustOutstanding: true,
    });
  });

  it('processes reimbursement and updates outstanding', async () => {
    await processAdvanceRefund(reimbursement, advance);

    expect(ReimbursementDomain.processReimbursement).to.be.calledWith(reimbursement);

    const modification = await DashboardAdvanceModification.findOne();
    expect(modification).to.be.null;
  });
});
