import 'mocha';
import * as sinon from 'sinon';
import { expect } from 'chai';
import factory from '../factories';
import loomisClient, { PaymentMethod as LoomisPaymentMethod } from '@dave-inc/loomis-client';
import { refundAdvanceCharges } from '../../src/crons/refund-overcharged-advances';
import { Advance, AdvanceTip } from '../../src/models';
import * as Reimbursement from '../../src/domain/reimbursement';
import { ExternalTransactionStatus } from '@dave-inc/wire-typings';
import * as Jobs from '../../src/jobs/data';

describe('refund-overcharged-advances crons', () => {
  const sandbox = sinon.createSandbox();

  let reimburseStub: sinon.SinonStub;
  let updateBrazeEventStub: sinon.SinonStub;

  beforeEach(() => {
    reimburseStub = sandbox.stub(Reimbursement, 'processReimbursement');
    updateBrazeEventStub = sandbox.stub(Jobs, 'updateBrazeTask').resolves();
  });

  afterEach(() => sandbox.restore());

  async function createAdvance(advanceFields?: any) {
    const advance = await factory.create<Advance>('advance', {
      outstanding: -10,
      ...advanceFields,
    });
    await factory.create('payment', {
      advanceId: advance.id,
      amount: advance.amount - advance.outstanding,
    });
    await factory.create<AdvanceTip>('advance-tip', {
      amount: 0,
      percent: 0,
      advanceId: advance.id,
    });
    await Promise.all([
      advance.getUser().then(u => (advance.user = u)),
      advance.getPayments().then(payments => (advance.payments = payments)),
      advance.getBankAccount().then(bankAccount => (advance.bankAccount = bankAccount)),
      advance.getReimbursements().then(reimbursements => (advance.reimbursements = reimbursements)),
    ]);
    return advance;
  }

  it('should fail if already reimbursed', async () => {
    const advance = await createAdvance();
    sandbox.stub(loomisClient, 'getPaymentMethod').resolves({ data: {} as LoomisPaymentMethod });
    advance.reimbursements = [
      await factory.create('reimbursement', {
        userId: advance.userId,
        advanceId: advance.id,
        amount: 10,
        status: 'COMPLETED',
      }),
    ];

    const result = await refundAdvanceCharges([
      {
        userId: advance.userId,
        advanceId: advance.id,
        amount: -advance.outstanding,
        advance,
      },
    ]);

    expect(result).to.be.empty;
    sinon.assert.notCalled(reimburseStub);
  });

  it('should fail if reimbursement fails', async () => {
    const advance = await createAdvance();
    sandbox.stub(loomisClient, 'getPaymentMethod').resolves({ data: {} as LoomisPaymentMethod });
    reimburseStub.callsFake(re => re.update({ status: 'FAILED' }));

    const result = await refundAdvanceCharges([
      {
        userId: advance.userId,
        advanceId: advance.id,
        amount: -advance.outstanding,
        advance,
      },
    ]);

    expect(result).to.be.empty;
  });

  it('should do nothing if advances > -1 outstanding', async () => {
    const advance = await createAdvance({ outstanding: -0.5 });

    const result = await refundAdvanceCharges([
      {
        userId: advance.userId,
        advanceId: advance.id,
        amount: -advance.outstanding,
        advance,
      },
    ]);

    expect(result).to.be.empty;
    await advance.reload();
    expect(advance.outstanding).to.eq(-0.5);
    expect(reimburseStub.callCount).to.eq(0);
  });

  it('should fall back to user primary bank account if advance bank account reimbursement fails', async () => {
    const advance = await createAdvance();
    const bankAccount = await factory.create('bank-account', {
      userId: advance.user.id,
    });
    advance.user.defaultBankAccountId = bankAccount.id;
    sandbox.stub(loomisClient, 'getPaymentMethod').resolves({ data: {} as LoomisPaymentMethod });
    reimburseStub.callsFake(re => re.update({ status: 'FAILED' }));
    reimburseStub
      .onCall(2)
      .callsFake(re => re.update({ status: ExternalTransactionStatus.Completed }));

    const result = await refundAdvanceCharges([
      {
        userId: advance.userId,
        advanceId: advance.id,
        amount: -advance.outstanding,
        advance,
      },
    ]);

    expect(result).not.to.be.empty;
    expect(reimburseStub.callCount).to.eq(3);
    expect(reimburseStub.thirdCall.args[0].payableId).to.eq(bankAccount.id);
    await advance.reload();
    expect(advance.outstanding).to.eq(0);
  });

  it('should fall back to user primary bank account payment method if advance bank account reimbursement fails', async () => {
    const advance = await createAdvance();
    const bankAccount = await factory.create('bank-account', {
      userId: advance.user.id,
    });
    advance.user.defaultBankAccountId = bankAccount.id;
    const paymentMethod = await factory.create('payment-method', { bankAccountId: bankAccount.id });
    await bankAccount.update({ defaultPaymentMethodId: paymentMethod.id });
    sandbox
      .stub(loomisClient, 'getPaymentMethod')
      .resolves({ data: { id: paymentMethod.id } as LoomisPaymentMethod });
    reimburseStub.callsFake(re => re.update({ status: 'FAILED' }));
    reimburseStub
      .onCall(2)
      .callsFake(re => re.update({ status: ExternalTransactionStatus.Completed }));
    const result = await refundAdvanceCharges([
      {
        userId: advance.userId,
        advanceId: advance.id,
        amount: -advance.outstanding,
        advance,
      },
    ]);

    expect(result).not.to.be.empty;
    expect(reimburseStub.callCount).to.eq(3);
    expect(reimburseStub.thirdCall.args[0].payableId).to.eq(paymentMethod.id);
    expect(advance.outstanding).to.eq(0);
  });

  it('should succeed', async () => {
    const advance = await createAdvance();
    const outstanding = advance.outstanding;
    sandbox.stub(loomisClient, 'getPaymentMethod').resolves({ data: {} as LoomisPaymentMethod });
    reimburseStub.callsFake(re => re.update({ status: 'COMPLETED' }));
    const result = await refundAdvanceCharges([
      {
        userId: advance.userId,
        advanceId: advance.id,
        amount: -advance.outstanding,
        advance,
      },
    ]);

    expect(result.length).to.equal(1);
    expect(result[0].userId).to.equal(advance.userId);
    expect(result[0].advanceId).to.equal(advance.id);
    expect(result[0].amount).to.equal(-outstanding);
  });

  it('should create a braze event', async () => {
    const advance = await createAdvance();
    const outstanding = advance.outstanding;
    sandbox.stub(loomisClient, 'getPaymentMethod').resolves({ data: {} as LoomisPaymentMethod });
    reimburseStub.callsFake(re => re.update({ status: 'COMPLETED' }));
    await refundAdvanceCharges([
      {
        userId: advance.userId,
        advanceId: advance.id,
        amount: -advance.outstanding,
        advance,
      },
    ]);

    expect(updateBrazeEventStub.callCount).to.equal(1);
    sinon.assert.calledWith(updateBrazeEventStub, {
      userId: advance.userId,
      eventProperties: {
        name: 'advance_overcharge_refund',
        properties: {
          amount: -outstanding,
        },
      },
    });
  });

  it('should 0 out the advance outstanding', async () => {
    const advance = await createAdvance({ outstanding: -10 });
    sandbox.stub(loomisClient, 'getPaymentMethod').resolves({ data: {} as LoomisPaymentMethod });
    reimburseStub.callsFake(re => re.update({ status: 'COMPLETED' }));

    const result = await refundAdvanceCharges([
      {
        userId: advance.userId,
        advanceId: advance.id,
        amount: -advance.outstanding,
        advance,
      },
    ]);

    expect(result).not.to.be.empty;
    await advance.reload();
    expect(advance.outstanding).to.eq(0);
  });
});
