/* tslint:disable:no-unused-expression */
import { expect } from 'chai';
import * as sinon from 'sinon';
import {
  serializeApprovalResponse,
  buildApprovalDict,
  getDefaultApprovalResult,
  saveApprovalPlaceholder,
  saveApprovalResults,
} from '../../../../../src/services/advance-approval/advance-approval-engine';
import {
  AdvanceApprovalResult,
  AdvanceApprovalTrigger,
  ApprovalDict,
  DecisionCase,
  DecisionNodeType,
  IDecisionCaseResponse,
} from '../../../../../src/services/advance-approval/types';
import {
  DecisionNode,
  ExperimentDecisionNode,
  getDecisionCaseError,
} from '../../../../../src/services/advance-approval/advance-approval-engine/decision-node';
import { clean } from '../../../../test-helpers';
import factory from '../../../../factories';
import { DEFAULT_TIMEZONE, moment } from '@dave-inc/time-lib';
import CounterLimiter from '../../../../../src/services/advance-approval/advance-approval-engine/limiters/counter-limiter';
import { Advance, AdvanceApproval, AdvanceExperimentLog } from '../../../../../src/models';
import { PaymentProviderDelivery } from '@dave-inc/wire-typings';
import stubBankTransactionClient from '../../../../test-helpers/stub-bank-transaction-client';
import * as UpdateExperiments from '../../../../../src/services/advance-approval/advance-approval-engine/experiments/update-experiments';
import {
  findExperimentDecisionNodes,
  updateAdvanceExperiments,
} from '../../../../../src/services/advance-approval/advance-approval-engine/experiments/update-experiments';
import { getApprovalBankAccount } from '../../../../../src/domain/advance-approval-request';

class NormalNode extends DecisionNode {
  public cases: Array<DecisionCase<AdvanceApprovalResult>> = [];
  public name = 'DecisionNode1';
  public type = DecisionNodeType.Static;
}

class ExperimentNode extends ExperimentDecisionNode {
  public name = 'ExperimentDecisionNode1';
  public id = 1;
  public description = 'Experiments are cool sometimes';
  public limiters: any[] = [];
  public type = DecisionNodeType.Static;

  public async isSuccessful({ result }: { result: AdvanceApprovalResult }): Promise<boolean> {
    return true;
  }
  public async onAdvanceCreated({ advanceId }: { advanceId: number }): Promise<void> {}

  protected async experimentCase(
    dict: any,
    limitersDidAllow = true,
    result: AdvanceApprovalResult,
  ): Promise<IDecisionCaseResponse<AdvanceApprovalResult>> {
    if (dict.returnError) {
      return {
        error: getDecisionCaseError('i-was-told-to-error'),
      };
    }

    return {
      updates: result,
      logData: result.extra,
    };
  }
}

describe('Experiment Decision Node Evaluation', () => {
  const sandbox = sinon.createSandbox();

  let engine: ExperimentNode;
  let approvalDict: ApprovalDict;
  let defaultResponse: AdvanceApprovalResult;

  before(() => clean(sandbox));

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

    engine = new ExperimentNode();
    await factory.create('advance-experiment', {
      id: engine.id,
    });
    sandbox.stub(UpdateExperiments, 'getAdvanceExperiments').returns([engine]);
  });

  afterEach(() => clean(sandbox));

  it('should allow user to visit experiment if previously visited and successfully received advance', async () => {
    // Create experiment log to simulate a previous experiment visit
    const advance = await factory.create('advance');
    await factory.create('advance-experiment-log', {
      userId: approvalDict.userId,
      advanceId: advance.id,
      advanceExperimentId: engine.id,
      bankAccountId: approvalDict.bankAccount.id,
      success: true,
    });
    engine.limiters = [new CounterLimiter(10, () => 11)];

    await engine.evaluate(approvalDict, defaultResponse);

    const advanceExperimentLog = await AdvanceExperimentLog.findOne({
      where: {
        advance_experiment_id: engine.id,
        advance_approval_id: approvalDict.approvalId,
        user_id: approvalDict.userId,
        bank_account_id: approvalDict.bankAccount.id,
      },
    });

    expect(advanceExperimentLog).to.contain({
      advanceExperimentId: engine.id,
      advanceApprovalId: approvalDict.approvalId,
      userId: approvalDict.userId,
      bankAccountId: approvalDict.bankAccount.id,
      success: true,
    });
  });

  it('should not let user visit experiment if any limiter resolves to false', async () => {
    engine.limiters = [new CounterLimiter(10, () => 11)];

    await engine.evaluate(approvalDict, defaultResponse);

    const advanceExperimentLog = await AdvanceExperimentLog.findOne({
      where: {
        advance_experiment_id: engine.id,
        advance_approval_id: approvalDict.approvalId,
        user_id: approvalDict.userId,
        bank_account_id: approvalDict.bankAccount.id,
      },
    });

    expect(advanceExperimentLog).to.be.null;
  });

  it('should let user visit experiment if all limiters resolve to true', async () => {
    engine.limiters = [new CounterLimiter(10, () => 0)];

    await engine.evaluate(approvalDict, defaultResponse);

    const advanceExperimentLog = await AdvanceExperimentLog.findOne({
      where: {
        advance_experiment_id: engine.id,
        advance_approval_id: approvalDict.approvalId,
        user_id: approvalDict.userId,
        bank_account_id: approvalDict.bankAccount.id,
      },
    });

    expect(advanceExperimentLog).to.contain({
      advanceExperimentId: engine.id,
      advanceApprovalId: approvalDict.approvalId,
      userId: approvalDict.userId,
      bankAccountId: approvalDict.bankAccount.id,
      success: true,
    });
  });
});

describe('findExperimentDecisionNodes', () => {
  it('should return an empty array if no experiments are present', () => {
    const node = new NormalNode();
    node.onSuccess(new NormalNode()).onFailure(new NormalNode());

    const nodes = findExperimentDecisionNodes(node);

    expect(nodes).to.have.lengthOf(0);
  });

  it('should return a single node if one experiment is present', () => {
    const node = new NormalNode();
    node.onSuccess(new NormalNode()).onFailure(new ExperimentNode());

    const nodes = findExperimentDecisionNodes(node);

    expect(nodes).to.have.lengthOf(1);
    expect(nodes[0]).to.be.instanceOf(ExperimentNode);
  });

  it('should return a two nodes if two experiments are present', () => {
    const node = new NormalNode();
    const second = new ExperimentNode();
    second.name = 'Experiment 2';
    node.onSuccess(new ExperimentNode()).onFailure(second);

    const nodes = findExperimentDecisionNodes(node);

    expect(nodes).to.have.lengthOf(2);
    expect(nodes[0]).to.be.instanceOf(ExperimentNode);
    expect(nodes[1]).to.be.instanceOf(ExperimentNode);
  });

  it('should ignore the same experiment if it runs twice', () => {
    const node = new NormalNode();
    node.onSuccess(new ExperimentNode()).onFailure(new ExperimentNode());

    const nodes = findExperimentDecisionNodes(node);

    expect(nodes).to.have.lengthOf(1);
  });
});

describe('logExperimentData', () => {
  let engine: ExperimentNode;
  let approvalDict: any;
  let defaultResponse: AdvanceApprovalResult;

  const sandbox = sinon.createSandbox();

  before(() => clean(sandbox));

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

    engine = new ExperimentNode();
    await factory.create('advance-experiment', {
      id: engine.id,
    });
    sandbox.stub(UpdateExperiments, 'getAdvanceExperiments').returns([engine]);
  });

  afterEach(() => clean(sandbox));

  it('should create a row in advance-experiment-log when we run an experiment node', async () => {
    await engine.evaluate(approvalDict, defaultResponse);

    const advanceExperimentLog = await AdvanceExperimentLog.findOne({
      where: {
        advance_experiment_id: engine.id,
        advance_approval_id: approvalDict.approvalId,
        user_id: approvalDict.userId,
        bank_account_id: approvalDict.bankAccount.id,
      },
    });

    expect(advanceExperimentLog).to.not.be.null;
    expect(advanceExperimentLog.success).to.be.true;
    expect(advanceExperimentLog.advanceId).to.be.null;
  });

  it('should create a row with success = false when experiment case returns an error', async () => {
    sandbox.stub(engine, 'isSuccessful').returns(false);

    await engine.evaluate({ ...approvalDict, returnError: true }, defaultResponse);

    const advanceExperimentLog = await AdvanceExperimentLog.findOne({
      where: {
        advance_experiment_id: engine.id,
        advance_approval_id: approvalDict.approvalId,
        user_id: approvalDict.userId,
        bank_account_id: approvalDict.bankAccount.id,
      },
    });

    expect(advanceExperimentLog).to.not.be.null;
    expect(advanceExperimentLog.success).to.be.false;
    expect(advanceExperimentLog.advanceId).to.be.null;
  });

  it('should create a row with success = false when experiment is not successful', async () => {
    sandbox.stub(engine, 'isSuccessful').returns(false);

    await engine.evaluate(approvalDict, defaultResponse);

    const advanceExperimentLog = await AdvanceExperimentLog.findOne({
      where: {
        advance_experiment_id: engine.id,
        advance_approval_id: approvalDict.approvalId,
        user_id: approvalDict.userId,
        bank_account_id: approvalDict.bankAccount.id,
      },
    });

    expect(advanceExperimentLog).to.not.be.null;
    expect(advanceExperimentLog.success).to.be.false;
    expect(advanceExperimentLog.advanceId).to.be.null;
  });

  it('should update a row in advance-experiment-log with and advanceId when we save an advance', async () => {
    await engine.evaluate(approvalDict, defaultResponse);
    const advanceApproval = await AdvanceApproval.findOne({
      where: { id: approvalDict.approvalId },
    });
    const advance = await Advance.create({
      userId: approvalDict.userId,
      bankAccountId: approvalDict.bankAccount.id,
      paymentMethodId: approvalDict.bankAccount.defaultPaymentMethod,
      chosenAdvanceApprovalId: advanceApproval.id,
      amount: 10,
      fee: 0,
      paybackDate: moment()
        .tz(DEFAULT_TIMEZONE)
        .format('YYYY-MM-DD'),
      tip: 0,
      tipPercent: 0,
      delivery: PaymentProviderDelivery.EXPRESS,
      outstanding: 10,
      referenceId: '0123456789ABCDE',
    });

    await updateAdvanceExperiments({
      advanceId: advance.id,
      advanceApprovalId: approvalDict.approvalId,
    });
    const advanceExperimentLog = await AdvanceExperimentLog.findOne({
      where: {
        advance_experiment_id: engine.id,
        advance_id: advance.id,
        user_id: approvalDict.userId,
        bank_account_id: approvalDict.bankAccount.id,
      },
    });

    expect(advanceExperimentLog).to.not.be.null;
    expect(advanceExperimentLog.advanceId).to.equal(advance.id);
  });

  it('should not update a row in advance-experiment-log with and advanceId when the chosenApprovalId is null', async () => {
    const result = serializeApprovalResponse(
      await engine.evaluate(approvalDict, defaultResponse),
      approvalDict,
    );
    await saveApprovalResults([result]);

    const advance = await Advance.create({
      userId: approvalDict.userId,
      bankAccountId: approvalDict.bankAccount.id,
      paymentMethodId: approvalDict.bankAccount.defaultPaymentMethod,
      chosenAdvanceApprovalId: null,
      amount: 10,
      fee: 0,
      paybackDate: moment()
        .tz(DEFAULT_TIMEZONE)
        .format('YYYY-MM-DD'),
      tip: 0,
      tipPercent: 0,
      delivery: PaymentProviderDelivery.EXPRESS,
      outstanding: 10,
      referenceId: '0123456789ABCDE',
    });

    await updateAdvanceExperiments({
      advanceId: advance.id,
      advanceApprovalId: null,
    });
    const advanceExperimentLog = await AdvanceExperimentLog.findOne({
      where: {
        advance_id: advance.id,
        user_id: approvalDict.userId,
        bank_account_id: approvalDict.bankAccount.id,
      },
    });

    expect(advanceExperimentLog).to.be.null;
  });

  it(`should not create a row in advance-experiment-log when we run an experiment node id limiters don't allow`, async () => {
    engine.limiters = [new CounterLimiter(0, () => 1)];
    await engine.evaluate(approvalDict, defaultResponse);
    const advanceExperimentLog = await AdvanceExperimentLog.findOne({
      where: {
        advance_approval_id: approvalDict.approvalId,
        user_id: approvalDict.userId,
        bank_account_id: approvalDict.bankAccount.id,
      },
    });

    expect(advanceExperimentLog).to.be.null;
  });
});
