import * as sinon from 'sinon';
import { expect } from 'chai';
import { performUserAccountChecks } from '../../../../src/api/v2/user/account-checks';
import AdvanceApprovalClient from '../../../../src/lib/advance-approval-client';
import factory from '../../../factories';
import { clean, stubBalanceLogClient, stubBankTransactionClient } from '../../../test-helpers';

describe('api/v2/user/account-checks', async () => {
  const sandbox = sinon.createSandbox();
  let preQualifyStub: sinon.SinonStub;
  let advanceClientGetRulesStub: sinon.SinonStub;

  beforeEach(() => {
    stubBankTransactionClient(sandbox);
    stubBalanceLogClient(sandbox);
    preQualifyStub = sandbox.stub(AdvanceApprovalClient, 'preQualifyUser');
    advanceClientGetRulesStub = sandbox.stub(AdvanceApprovalClient, 'getRules');
  });

  afterEach(() => sandbox.restore());

  after(() => clean(sandbox));

  it('should perform account checks', async () => {
    const bod = await factory.create('bod-checking-account');
    const bodConn = await factory.create('bank-of-dave-bank-connection', {
      userId: bod.userId,
      primaryBankAccountId: bod.id,
    });
    await bod.update({ bankConnectionId: bodConn.id });

    preQualifyStub.resolves({});
    advanceClientGetRulesStub.resolves({});
    await performUserAccountChecks(bod.userId);

    expect(preQualifyStub.callCount).to.equal(1);

    const { userId, bankAccount } = preQualifyStub.firstCall.args[0];
    expect(userId).to.equal(bod.userId);
    expect(bankAccount.id).to.equal(bod.id);
    expect(bankAccount.isDaveBanking).to.be.true;
  });

  it('should set Dave Banking eligibility to true', async () => {
    const bod = await factory.create('bod-checking-account');
    const bodConn = await factory.create('bank-of-dave-bank-connection', {
      userId: bod.userId,
      primaryBankAccountId: bod.id,
    });
    await bod.update({ bankConnectionId: bodConn.id });

    preQualifyStub.resolves({
      isDaveBankingEligible: true,
      daveBankingIncomes: [999],
    });
    advanceClientGetRulesStub.resolves({
      minDaveBankingMonthlyDD: 100,
    });
    const accountChecks = await performUserAccountChecks(bod.userId);
    expect(accountChecks.daveBankingMemberProgram.hasQualifiedDD).to.be.true;
    expect(accountChecks.daveBankingMemberProgram.qualifiedIncomes).to.deep.equal([999]);
    expect(accountChecks.daveBankingMemberProgram.minimumMonthlyDDAmount).to.satisfy(
      Number.isInteger,
    );
  });
});
