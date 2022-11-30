/* tslint:disable:no-unused-expression */
import { expect } from 'chai';
import * as sinon from 'sinon';
import {
  buildApprovalDict,
  getDefaultApprovalResult,
  saveApprovalPlaceholder,
} from '../../../../../src/services/advance-approval/advance-approval-engine';
import {
  AdvanceApprovalResult,
  AdvanceApprovalTrigger,
  ApprovalDict,
  DecisionCase,
  DecisionCaseError,
  DecisionNodeType,
  IDecisionCaseResponse,
} from '../../../../../src/services/advance-approval/types';
import { DecisionNode } from '../../../../../src/services/advance-approval/advance-approval-engine/decision-node';
import { clean } from '../../../../test-helpers';
import { dogstatsd } from '../../../../../src/lib/datadog-statsd';
import factory from '../../../../factories';
import { AdvanceNodeLog, AdvanceRuleLog } from '../../../../../src/models';
import stubBankTransactionClient from '../../../../test-helpers/stub-bank-transaction-client';
import { getApprovalBankAccount } from '../../../../../src/domain/advance-approval-request';

class TestNode extends DecisionNode {
  public static async testAdvanceRuleLogSuccess(
    approvalDict: ApprovalDict,
    input: AdvanceApprovalResult,
  ): Promise<IDecisionCaseResponse<AdvanceApprovalResult>> {
    return { updates: { approvedAmounts: [1, 2, 3] }, logData: { mainPaycheckId: 7331 } };
  }

  public static async testAdvanceRuleLogFailure(
    approvalDict: ApprovalDict,
    input: AdvanceApprovalResult,
  ): Promise<IDecisionCaseResponse<AdvanceApprovalResult>> {
    return {
      updates: { approvedAmounts: [1, 2, 3] },
      error: { type: 'testFailureError', message: 'this case failed' },
    };
  }

  public cases: Array<DecisionCase<AdvanceApprovalResult>> = [
    TestNode.testAdvanceRuleLogSuccess,
    TestNode.testAdvanceRuleLogFailure,
  ];
  public name = 'TestNode';
  public type = DecisionNodeType.Static;

  protected onError(
    errors: DecisionCaseError[],
    dict: ApprovalDict,
    prev: AdvanceApprovalResult,
  ): AdvanceApprovalResult {
    return {
      ...prev,
      approvedAmounts: [],
      rejectionReasons: errors,
    };
  }
}

describe('logData', () => {
  let engine: TestNode;
  let approvalDict: any;
  let defaultResponse: AdvanceApprovalResult;
  const sandbox = sinon.createSandbox();
  let dogstatsdIncrementStub: sinon.SinonStub;

  beforeEach(async () => {
    stubBankTransactionClient(sandbox);
    const bankAccount = await factory.create('bank-account');
    const user = await bankAccount.getUser();

    approvalDict = await buildApprovalDict(
      user.id,
      await getApprovalBankAccount(bankAccount),
      { totalAdvancesTaken: 10, outstandingAdvance: null },
      null,
      AdvanceApprovalTrigger.UserTerms,
      'America/New_York',
      { auditLog: true },
    );
    await saveApprovalPlaceholder(approvalDict);
    defaultResponse = getDefaultApprovalResult(approvalDict, {});

    dogstatsdIncrementStub = sandbox.stub(dogstatsd, 'increment');

    engine = new TestNode();
    await engine.evaluate(approvalDict, defaultResponse);
  });

  afterEach(() => clean(sandbox));

  it('should create a row in advance-node-log when we successfully run a decision node', async () => {
    const node = new TestNode();
    node.name = 'TestNodeSuccess';
    node.cases.pop();
    await node.evaluate(approvalDict, defaultResponse);
    const advanceNodeLog = await AdvanceNodeLog.findOne({
      where: {
        advance_approval_id: approvalDict.approvalId,
        name: node.name,
      },
    });

    expect(advanceNodeLog).to.not.be.null;
    expect(advanceNodeLog.success).to.be.true;
  });

  it('should create a row in advance-node-log when we unsuccessfully run a decision node', async () => {
    const advanceNodeLog = await AdvanceNodeLog.findOne({
      where: {
        advance_approval_id: approvalDict.approvalId,
        name: engine.name,
      },
    });

    expect(advanceNodeLog).to.not.be.null;
    expect(advanceNodeLog.success).to.be.false;
  });

  it('should create a row in advance-rule-log when we successfully run a case in a decision node', async () => {
    const advanceRuleLog = await AdvanceRuleLog.findOne({
      where: {
        advance_approval_id: approvalDict.approvalId,
        node_name: engine.name,
        rule_name: 'testAdvanceRuleLogSuccess',
      },
    });

    expect(advanceRuleLog).to.not.be.null;
    expect(advanceRuleLog.success).to.be.true;
    expect(advanceRuleLog.data).to.exist;
    expect(advanceRuleLog.data.mainPaycheckId).to.equal(7331);
    expect(dogstatsdIncrementStub).to.be.called;
    expect(dogstatsdIncrementStub).to.be.calledWith(`approval_events.decision_case_completed`);
  });

  it('should create a row in advance-rule-log when we unsuccessfully run a case in a decision node', async () => {
    const advanceRuleLog = await AdvanceRuleLog.findOne({
      where: {
        advance_approval_id: approvalDict.approvalId,
        node_name: engine.name,
        rule_name: 'testAdvanceRuleLogFailure',
      },
    });

    expect(advanceRuleLog).to.not.be.null;
    expect(advanceRuleLog.success).to.be.false;
    expect(advanceRuleLog.data).to.not.exist;
    expect(advanceRuleLog.error).to.exist;
    expect(advanceRuleLog.error).to.equal('testFailureError');
    expect(dogstatsdIncrementStub).to.be.called;
    expect(dogstatsdIncrementStub).to.be.calledWith(`approval_events.decision_case_completed`);
  });

  it('should not create a row in advance-node-log if auditLog is set to false', async () => {
    const node = new TestNode();
    const bankAccount = await factory.create('bank-account');
    const user = await bankAccount.getUser();
    node.name = 'TestNodeSuccess';
    node.cases.pop();
    approvalDict = await buildApprovalDict(
      user,
      bankAccount,
      { totalAdvancesTaken: 10, outstandingAdvance: null },
      null,
      AdvanceApprovalTrigger.UserTerms,
      'America/New_York',
      { auditLog: false },
    );
    await node.evaluate(approvalDict, defaultResponse);
    const advanceNodeLog = await AdvanceNodeLog.findOne({
      where: {
        name: node.name,
      },
    });

    expect(advanceNodeLog).to.be.null;
  });
});
