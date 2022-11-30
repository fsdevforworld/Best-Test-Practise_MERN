import { expect } from 'chai';

import factory from '../../factories';
import { clean } from '../../test-helpers';
import {
  createAdvanceRefund,
  IAdvanceRefundRequestLineItem,
} from '../../../src/domain/advance-refund';
import { Advance, BankAccount, User } from '../../../src/models';

describe('createAdvanceRefund', () => {
  before(() => clean());
  afterEach(() => clean());

  let advance: Advance;
  let user: User;
  let bankAccount: BankAccount;

  beforeEach(async () => {
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

    const connection = await factory.create('bank-connection', { userId: user.id });

    bankAccount = await factory.create('bank-account', {
      lastFour: '1234',
      bankConnectionId: connection.id,
      userId: user.id,
      subtype: 'CHECKING',
    });
  });

  it('creates reimbursement, advanceRefund, and advanceRefundLineItems', async () => {
    const lineItems: IAdvanceRefundRequestLineItem[] = [
      {
        reason: 'fee',
        amount: 5,
      },
      {
        reason: 'overpayment',
        amount: 50,
      },
    ];

    const { reimbursement, advanceRefund, advanceRefundLineItems } = await createAdvanceRefund({
      userId: user.id,
      destination: bankAccount,
      advance,
      lineItems,
    });

    expect(reimbursement.amount).to.equal(55);
    expect(reimbursement.payableId).to.equal(bankAccount.id);

    expect(advanceRefund.reimbursementId).to.equal(reimbursement.id);
    expect(advanceRefund.advanceId).to.equal(advance.id);

    expect(advanceRefundLineItems).to.have.length(2);

    const feeLineItem = advanceRefundLineItems.find(lineItem => lineItem.reason === 'fee');
    const overpaymentLineItem = advanceRefundLineItems.find(
      lineItem => lineItem.reason === 'overpayment',
    );

    expect(feeLineItem.amount).to.equal(5);
    expect(feeLineItem.adjustOutstanding).to.be.false;

    expect(overpaymentLineItem.amount).to.equal(50);
    expect(overpaymentLineItem.adjustOutstanding).to.be.true;
  });

  it('adds dashboard action log id to reimbursement', async () => {
    const dashboardActionLog = await factory.create('dashboard-action-log');

    const lineItems: IAdvanceRefundRequestLineItem[] = [
      {
        reason: 'overpayment',
        amount: 50,
      },
    ];

    const { reimbursement } = await createAdvanceRefund({
      userId: user.id,
      destination: bankAccount,
      advance,
      lineItems,
      dashboardActionLogId: dashboardActionLog.id,
    });

    expect(reimbursement.dashboardActionLogId).to.equal(dashboardActionLog.id);
  });
});
