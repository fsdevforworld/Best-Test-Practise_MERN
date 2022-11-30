import { expect } from 'chai';
import { Assignment } from 'planout';
import * as sinon from 'sinon';

import {
  Advance,
  AdvanceApproval,
  AdvanceExperimentLog,
  AdvanceNodeLog,
  BankAccount,
  User,
} from '../../../../../src/models';
import {
  AdvanceApprovalResult,
  AdvanceApprovalTrigger,
  ApprovalDict,
} from '../../../../../src/services/advance-approval/types';

import { buildApprovalDict } from '../../../../../src/services/advance-approval/advance-approval-engine';
import { ExperimentId } from '../../../../../src/services/advance-approval/advance-approval-engine/experiments';
import ExperimentGateNode, {
  ExperimentPath,
} from '../../../../../src/services/advance-approval/advance-approval-engine/experiments/experiment-gate-node';

import Counter from '../../../../../src/lib/counter';

import factory from '../../../../factories';
import { clean } from '../../../../test-helpers';
import stubBankTransactionClient from '../../../../test-helpers/stub-bank-transaction-client';
import { BooleanValue } from '../../../../../src/typings';
import * as UpdateExperiments from '../../../../../src/services/advance-approval/advance-approval-engine/experiments/update-experiments';
import { getApprovalBankAccount } from '../../../../../src/domain/advance-approval-request';

describe('experiment-gate-node', () => {
  const sandbox = sinon.createSandbox();

  let dict: ApprovalDict;
  let counterGetValueStub: sinon.SinonStub;

  before(() => clean());

  beforeEach(async () => {
    stubBankTransactionClient(sandbox);
    const user = await factory.create<User>('user', { id: 2 });
    const bankAccount = await factory.create<BankAccount>('bank-account', { userId: user.id });
    const advanceApproval = await factory.create<AdvanceApproval>('advance-approval', {
      userId: user.id,
      bankAccountId: bankAccount.id,
    });

    counterGetValueStub = sandbox.stub(Counter.prototype, 'getValue');
    dict = await buildApprovalDict(
      user.id,
      await getApprovalBankAccount(bankAccount),
      { totalAdvancesTaken: 10, outstandingAdvance: null },
      null,
      AdvanceApprovalTrigger.UserTerms,
      'America/New_York',
      {
        auditLog: true,
      },
    );
    dict.approvalId = advanceApproval.id;
  });

  afterEach(() => clean(sandbox));

  [
    {
      testCase:
        'should successfully pass node if counter is below limit and bucketed in experiment group',
      active: true,
      counter: {
        underLimit: true,
      },
      bucketed: true,
      expected: true,
    },
    {
      testCase:
        'should successfully pass node if there is no counter and bucketed in experiment group',
      active: true,
      bucketed: true,
      expected: true,
    },
    {
      testCase:
        'should fail node if not active, counter is below limit, and bucketed in experiment group',
      active: false,
      counter: {
        underLimit: true,
      },
      bucketed: true,
      expected: false,
    },
    {
      testCase: 'should fail node if counter is below limit, but not bucketed in experiment group',
      active: true,
      counter: {
        underLimit: true,
      },
      bucketed: false,
      expected: false,
    },
    {
      testCase:
        'should fail node if counter limit is reached, even when bucketed in experiment group',
      active: true,
      counter: {
        underLimit: false,
      },
      bucketed: true,
      expected: false,
    },
    {
      testCase:
        'should fail node if counter limit is reached, and not bucketed in experiment group',
      active: true,
      counter: {
        underLimit: false,
      },
      bucketed: false,
      expected: false,
    },
  ].forEach(({ testCase, active, counter, bucketed, expected }) => {
    it(testCase, async () => {
      const experimentGateNode = new ExperimentGateNode({
        id: ExperimentId.Covid19ReturnToBaselineExperiment,
        name: 'Pizza Lovers',
        description: 'Approves all pizza lovers',
        ...(counter
          ? {
              counter: {
                limit: 100,
                incrementOnAdvanceCreated: async () => true,
              },
            }
          : {}),
        active,
        isSuccessful: async () => true,
      });
      sandbox.stub(UpdateExperiments, 'getAdvanceExperiments').returns([experimentGateNode]);
      sandbox.stub(ExperimentPath.prototype, 'isInExperimentGroup').returns(bucketed);

      if (counter) {
        counterGetValueStub.returns(counter.underLimit ? 99 : 100);
      }

      const { isExperimental } = await experimentGateNode.evaluate(dict, {
        caseResolutionStatus: {},
      } as AdvanceApprovalResult);

      expect(isExperimental).to.eq(expected);

      const advanceNodeLogs = await AdvanceNodeLog.findAll();
      const advanceExperimentLogs = await AdvanceExperimentLog.findAll({
        where: {
          userId: dict.userId,
          bankAccountId: dict.bankAccount.id,
        },
      });

      expect(advanceNodeLogs).to.have.length(1);
      expect(advanceNodeLogs[0].name).to.eq('experiment_gate_Pizza Lovers');
      expect(advanceNodeLogs[0].success).to.eq(expected);

      const limitersDidAllow = active && bucketed && (!counter || counter.underLimit);

      if (limitersDidAllow) {
        expect(advanceExperimentLogs).to.have.length(1);
        expect(advanceExperimentLogs[0].advanceExperimentId).to.eq(
          ExperimentId.Covid19ReturnToBaselineExperiment,
        );
        expect(advanceExperimentLogs[0].success).to.eq(expected);
      } else {
        expect(advanceExperimentLogs).to.be.empty;
      }
    });
  });

  it('should bucket everyone if no ratio is set', async () => {
    const planOutSpy = sandbox.spy(Assignment.prototype, 'set');
    const experimentGateNode = new ExperimentGateNode({
      id: ExperimentId.Covid19ReturnToBaselineExperiment,
      name: 'Pizza Lovers',
      description: 'Approves all pizza lovers',
      counter: {
        limit: 50,
        incrementOnAdvanceCreated: async () => true,
      },
      isSuccessful: async () => true,
    });
    sandbox.stub(UpdateExperiments, 'getAdvanceExperiments').returns([experimentGateNode]);

    let total = 0;
    for (let i = 0; i < 50; i++) {
      const user = await factory.create('user');
      dict.userId = user.id;

      counterGetValueStub.returns(total);

      const result = await experimentGateNode.evaluate(dict, {
        caseResolutionStatus: {},
      } as AdvanceApprovalResult);
      if (result.isExperimental) {
        total += 1;
      }

      sinon.assert.calledWith(
        planOutSpy,
        'is_in_experiment_group',
        sinon.match({
          args: {
            unit: dict.userId,
            choices: [BooleanValue.True, BooleanValue.False],
            weights: [1, 0],
          },
        }),
      );
    }

    expect(total).to.eq(50);
  });

  it('should use plan out library to bucket users with provided ratio', async () => {
    const planOutSpy = sandbox.spy(Assignment.prototype, 'set');
    const experimentGateNode = new ExperimentGateNode({
      id: ExperimentId.Covid19ReturnToBaselineExperiment,
      name: 'Pizza Lovers',
      description: 'Approves all pizza lovers',
      ratio: 0.5,
      isSuccessful: async () => true,
    });

    await experimentGateNode.evaluate(dict, { caseResolutionStatus: {} } as AdvanceApprovalResult);

    sinon.assert.calledOnce(planOutSpy);
    sinon.assert.calledWith(
      planOutSpy,
      'is_in_experiment_group',
      sinon.match({
        args: {
          unit: dict.userId,
          choices: [BooleanValue.True, BooleanValue.False],
          weights: [0.5, 0.5],
        },
      }),
    );
  });

  it('should honor the provided custom limiter', async () => {
    const experimentGateNode = new ExperimentGateNode({
      id: ExperimentId.Covid19ReturnToBaselineExperiment,
      name: 'Admin Pizza Lovers',
      description: 'Approves admins requests only',
      ratio: 1,
      isSuccessful: async () => true,
      customLimiter: async approvalDict => {
        return approvalDict.isAdmin === true;
      },
    });

    sandbox.stub(UpdateExperiments, 'getAdvanceExperiments').returns([experimentGateNode]);

    dict.isAdmin = false;
    let { isExperimental } = await experimentGateNode.evaluate(dict, {
      caseResolutionStatus: {},
    } as AdvanceApprovalResult);
    expect(isExperimental).to.be.false;

    dict.isAdmin = true;
    ({ isExperimental } = await experimentGateNode.evaluate(dict, {
      caseResolutionStatus: {},
    } as AdvanceApprovalResult));
    expect(isExperimental).to.be.true;
  });

  describe('onAdvanceCreated', () => {
    [
      {
        incrementCounterOnAdvanceCreatedResponse: true,
        expected: true,
      },
      {
        incrementCounterOnAdvanceCreatedResponse: false,
        expected: false,
      },
    ].forEach(({ incrementCounterOnAdvanceCreatedResponse, expected }) => {
      it('should increment counter based on the provided conditional', async () => {
        const incrementCounterOnAdvanceCreatedStub = sandbox
          .stub()
          .returns(incrementCounterOnAdvanceCreatedResponse);
        const counterIncrementStub = sandbox.stub(Counter.prototype, 'increment');

        const experimentGateNode = new ExperimentGateNode({
          id: ExperimentId.Covid19ReturnToBaselineExperiment,
          name: 'Pizza Lovers',
          description: 'Approves all pizza lovers',
          counter: {
            limit: 100,
            incrementOnAdvanceCreated: incrementCounterOnAdvanceCreatedStub,
          },
          ratio: 0.5,
          isSuccessful: async () => true,
        });

        const advance = await factory.create<Advance>('advance');
        const experimentLog = await factory.create<AdvanceExperimentLog>('advance-experiment-log');
        const isFirstAdvanceForExperiment = true;

        await experimentGateNode.onAdvanceCreated({
          advanceId: advance.id,
          experimentLog,
          isFirstAdvanceForExperiment,
        });

        sinon.assert.calledWith(incrementCounterOnAdvanceCreatedStub, {
          advanceId: advance.id,
          experimentLog: sinon.match({ id: experimentLog.id }),
          isFirstAdvanceForExperiment,
        });

        if (expected) {
          sinon.assert.calledOnce(counterIncrementStub);
        } else {
          sinon.assert.notCalled(counterIncrementStub);
        }
      });
    });
  });
});
