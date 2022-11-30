import { expect } from 'chai';
import { flatMap, get } from 'lodash';
import * as sinon from 'sinon';
import { InvalidParametersError } from '@dave-inc/error-types';
import {
  buildApprovalDict,
  saveApprovalPlaceholder,
} from '../../../../../src/services/advance-approval/advance-approval-engine';
import { getApprovedAmountsByMaximumApprovedAmount } from '../../../../../src/services/advance-approval/advance-approval-engine/common';
import {
  AdvanceApprovalTrigger,
  ApprovalDict,
  CalculatedScore,
  DecisionNodeType,
  DynamicScoreLimits,
  UnderwritingMlConfig,
  UnderwritingModelConfigKey,
  UnderwritingScoreLimits,
} from '../../../../../src/services/advance-approval/types';
import { moment, Moment } from '@dave-inc/time-lib';
import { AdvanceNodeLog, AdvanceRuleLog, BankAccount } from '../../../../../src/models';
import { clean, stubBankTransactionClient, stubUnderwritingML } from '../../../../test-helpers';
import factory from '../../../../factories';
import { getUnderwritingModelConfig } from '../../../../../src/services/advance-approval/machine-learning';
import {
  default as buildMachineLearningNode,
  buildScoreGenerator,
  isDynamicLimit,
} from '../../../../../src/services/advance-approval/advance-approval-engine/nodes/machine-learning-node';
import { getApprovalBankAccount } from '../../../../../src/domain/advance-approval-request';
import { ScoreLimitGenerator } from '../cases';

describe('Machine Learning Node', () => {
  const sandbox = sinon.createSandbox();
  const MODEL_CONFIGS = Object.values(UnderwritingModelConfigKey)
    .map(modelConfigKey => ({
      key: modelConfigKey,
      config: getUnderwritingModelConfig(modelConfigKey),
    }))
    .filter(m => m.config.scoreLimits.toString() !== 'calculated');

  let approvalDict: ApprovalDict;

  before(() => clean());

  describe('buildScoreGenerator', () => {
    it('should throw if configuration is "calculated"', () => {
      const scoreLimitConfig = CalculatedScore;
      expect(() => buildScoreGenerator(scoreLimitConfig)).to.throw(InvalidParametersError);
    });

    it('should return configured static score limits', () => {
      const scoreLimitConfig: UnderwritingScoreLimits = {
        100: 0.9,
        50: 0.2,
      };
      const result = buildScoreGenerator(scoreLimitConfig);
      expect(result).to.deep.equal(scoreLimitConfig);
    });

    function mockTakenCount(count: number) {
      return { advanceSummary: { totalAdvancesTaken: count } } as any;
    }

    it('should return dynamic score limits', () => {
      const scoreLimitConfig: DynamicScoreLimits = {
        0: {
          100: 0.9,
          50: 0.2,
        },
        5: {
          100: 0.5,
          50: 0.3,
        },
        10: {
          100: 0.7,
        },
      };

      const result = buildScoreGenerator(scoreLimitConfig);
      expect(result).to.be.a('function');

      const generator = result as ScoreLimitGenerator;
      expect(generator(mockTakenCount(12))).to.deep.equal(scoreLimitConfig['10']);
      expect(generator(mockTakenCount(10))).to.deep.equal(scoreLimitConfig['10']);
      expect(generator(mockTakenCount(6))).to.deep.equal(scoreLimitConfig['5']);
      expect(generator(mockTakenCount(5))).to.deep.equal(scoreLimitConfig['5']);
      expect(generator(mockTakenCount(4))).to.deep.equal(scoreLimitConfig['0']);
      expect(generator(mockTakenCount(0))).to.deep.equal(scoreLimitConfig['0']);
    });
  });

  describe('buildMachineLearningNode', () => {
    beforeEach(async () => {
      stubBankTransactionClient(sandbox);
      const bankAccount = await factory.create<BankAccount>('bank-account');

      approvalDict = await buildApprovalDict(
        bankAccount.userId,
        await getApprovalBankAccount(bankAccount),
        { totalAdvancesTaken: 10, outstandingAdvance: null },
        null,
        AdvanceApprovalTrigger.UserTerms,
        'America/New_York',
        { auditLog: true },
      );

      await saveApprovalPlaceholder(approvalDict);
    });

    function getScoreLimits(config: UnderwritingMlConfig) {
      const scoreLimit = config.scoreLimits;

      if (isDynamicLimit(scoreLimit)) {
        return get(scoreLimit, '10');
      } else {
        return scoreLimit;
      }
    }

    afterEach(() => clean(sandbox));

    [
      // Assert failures when scores are below the lowest score possible for each model
      ...MODEL_CONFIGS.map(({ key, config }) => {
        const scoreLimits = getScoreLimits(config);
        const lowestScore: number = Object.entries(scoreLimits)[0][1] as number;

        return {
          testCase: `should fail ${config.modelType} with score of ${lowestScore - 0.001}`,
          modelConfigKey: key,
          score: lowestScore - 0.001,
          expected: {
            approvedAmounts: [],
          },
        };
      }),

      // Assert thresholds for every model is working properly
      ...flatMap(MODEL_CONFIGS, ({ key, config }) => {
        const scoreLimits = getScoreLimits(config);
        return flatMap(Object.entries(scoreLimits), ([stringAmount, score]: [string, number]) => ({
          testCase: `should pass ${config.modelType} for ${stringAmount} with score of ${score}`,
          modelConfigKey: key,
          score,
          expected: {
            approvedAmounts: getApprovedAmountsByMaximumApprovedAmount(parseInt(stringAmount, 10)),
          },
        }));
      }),
    ].forEach(({ testCase, modelConfigKey, score, expected }) => {
      it(testCase, async () => {
        const config = getUnderwritingModelConfig(modelConfigKey);
        let dynamicScoreLimits: ScoreLimitGenerator | undefined;
        if (config.scoreLimits === CalculatedScore) {
          dynamicScoreLimits = () => ({ 100: 0.0 });
        }

        const node = buildMachineLearningNode({
          name: 'ml_node',
          modelConfigKey,
          dynamicScoreLimits,
        });
        const input = {
          caseResolutionStatus: {},
          defaultPaybackDate: moment(),
        };
        const mlRequestStub = stubUnderwritingML(sandbox, { score });

        const result = await node.evaluate(approvalDict as any, input as any);

        sinon.assert.calledOnce(mlRequestStub);
        sinon.assert.calledWith(
          mlRequestStub,
          {
            userId: approvalDict.userId,
            bankAccountId: approvalDict.bankAccount.id,
            paybackDate: sinon.match((v: Moment) => v.isSame(input.defaultPaybackDate, 'day')),
            modelType: config.modelType,
            cacheOnly: approvalDict.mlUseCacheOnly,
          },
          { oracleConfig: config.oracle },
        );

        expect(result).to.deep.include(expected);
        expect(node.type).to.eq(DecisionNodeType.MachineLearning);

        const nodeLogs = await AdvanceNodeLog.findAll({
          where: { advanceApprovalId: approvalDict.approvalId },
        });
        const ruleLogs = await AdvanceRuleLog.findAll({
          where: { advanceApprovalId: approvalDict.approvalId },
        });

        expect(nodeLogs).to.have.length(1);
        expect(ruleLogs).to.have.length(1);

        expect(nodeLogs[0]).to.contain({
          name: 'ml_node',
          success: Boolean(expected.approvedAmounts.length),
        });
        expect(ruleLogs[0]).to.contain({
          ruleName: 'modelCase',
          nodeName: 'ml_node',
          success: Boolean(expected.approvedAmounts.length),
          error: expected.approvedAmounts.length ? null : 'ml-model-disapproved',
        });
        expect(ruleLogs[0].data).to.deep.eq({
          mlScore: score,
          mlDidRun: true,
          mlDidError: false,
          mlApprovedAmount: expected.approvedAmounts.length
            ? expected.approvedAmounts[expected.approvedAmounts.length - 1]
            : 0,
          scoreLimits: getScoreLimits(config),
        });
      });
    });

    it('fails when ml request errors out', async () => {
      const node = buildMachineLearningNode({
        name: 'gfm_node',
        modelConfigKey: UnderwritingModelConfigKey.AccountAgeFailureGMV1,
      });
      const config = getUnderwritingModelConfig(UnderwritingModelConfigKey.AccountAgeFailureGMV1);

      const input = {
        caseResolutionStatus: {},
        defaultPaybackDate: moment(),
      };
      const mlRequestStub = stubUnderwritingML(sandbox, { error: new Error('not cool man') });

      const result = await node.evaluate(approvalDict as any, input as any);

      sinon.assert.calledOnce(mlRequestStub);
      sinon.assert.calledWith(
        mlRequestStub,
        {
          userId: approvalDict.userId,
          bankAccountId: approvalDict.bankAccount.id,
          paybackDate: sinon.match((v: Moment) => v.isSame(input.defaultPaybackDate, 'day')),
          modelType: config.modelType,
          cacheOnly: approvalDict.mlUseCacheOnly,
        },
        { oracleConfig: config.oracle },
      );

      expect(result).to.deep.include({
        approvedAmounts: [],
      });

      const nodeLogs = await AdvanceNodeLog.findAll({
        where: { advanceApprovalId: approvalDict.approvalId },
      });
      const ruleLogs = await AdvanceRuleLog.findAll({
        where: { advanceApprovalId: approvalDict.approvalId },
      });

      expect(nodeLogs).to.have.length(1);
      expect(ruleLogs).to.have.length(1);

      expect(nodeLogs[0]).to.contain({
        name: 'gfm_node',
        success: false,
      });
      expect(ruleLogs[0]).to.contain({
        ruleName: 'modelCase',
        nodeName: 'gfm_node',
        success: false,
        error: 'ml-errored',
      });
      expect(ruleLogs[0].data).to.deep.include({
        mlDidRun: true,
        mlDidError: true,
        mlApprovedAmount: 0,
        scoreLimits: config.scoreLimits,
      });
    });
  });
});
