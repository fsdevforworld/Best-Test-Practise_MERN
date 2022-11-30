import { expect } from 'chai';
import { DEFAULT_TIMEZONE, moment } from '@dave-inc/time-lib';
import * as sinon from 'sinon';
import { forceExperimentBucketing } from '@dave-inc/experiment';
import * as MachineLearningDomain from '../../../src/domain/machine-learning';
import { PREDICTED_PAYBACK_MODEL_CONFIG, Strategy } from '../../../src/domain/machine-learning';
import { maxScorePaybackDateExperiment } from '../../../src/domain/machine-learning/payback-date';
import factory from '../../factories';
import { clean, fakeDateTime, replayHttp, stubExperimentLimiter } from '../../test-helpers';
import { AdvanceApproval, AdvancePaybackDatePrediction } from '../../../src/models';
import * as config from 'config';
import { PredictedPaybackMlConfig } from '../../../src/services/advance-approval/types';

describe('Machine Learning - Payback Date', () => {
  const sandbox = sinon.createSandbox();
  const now = moment.tz('2020-03-12', 'YYYY-MM-DD', DEFAULT_TIMEZONE);
  const expectedOracleVersion = `v${PREDICTED_PAYBACK_MODEL_CONFIG.oracle.version.major}.${PREDICTED_PAYBACK_MODEL_CONFIG.oracle.version.minor}`;

  let advanceApproval: AdvanceApproval;

  /**
   * helper method to generate "prediction-like" objects.
   * @param param0
   */
  function toPrediction({
    date,
    success = false,
    strategy = Strategy.EARLIEST_OVER_THRESHOLD,
    type = PREDICTED_PAYBACK_MODEL_CONFIG.modelType,
    threshold = PREDICTED_PAYBACK_MODEL_CONFIG.scoreLimit,
  }: {
    date: string;
    success?: boolean;
    strategy?: Strategy;
    type?: string;
    threshold?: number | null;
  }) {
    const model: any = {
      type,
      oracleVersion: expectedOracleVersion,
      strategy: strategy.toString(),
    };
    if (threshold) {
      model.threshold = threshold;
    }
    return {
      success,
      advanceApprovalId: advanceApproval.id,
      predictedDate: moment(date),
      extra: {
        model,
      },
    };
  }

  before(() => clean());

  beforeEach(async () => {
    // Need to create user & bank account with specific ids, so that we can use in fixtures
    await factory.create('user', {
      id: 1,
    });
    await factory.create('bank-account', {
      id: 1,
      userId: 1,
    });

    advanceApproval = await factory.create<AdvanceApproval>('advance-approval', {
      userId: 1,
      bankAccountId: 1,
      microAdvanceApproved: true,
    });

    fakeDateTime(sandbox, now);

    forceExperimentBucketing(sandbox, { [maxScorePaybackDateExperiment]: false });
    stubExperimentLimiter(sandbox);
  });

  afterEach(() => clean(sandbox));

  describe('predictPaybackDate', () => {
    it(
      'should return null if no predictions are above the threshold',
      replayHttp(
        'machine-learning/predicted-payback/oracle/predictions-with-nothing-eligible.json',
        async () => {
          const predictedPaybackDate = await MachineLearningDomain.predictPaybackDate({
            advanceApprovalId: advanceApproval.id,
            userId: advanceApproval.userId,
            bankAccountId: advanceApproval.bankAccountId,
          });

          expect(predictedPaybackDate).to.be.null;

          const predictions = await AdvancePaybackDatePrediction.findAll({
            where: { advanceApprovalId: advanceApproval.id },
          });

          expect(predictions).to.have.length(8);
          expect(
            predictions.map(({ advanceApprovalId, predictedDate, success, extra }) => ({
              advanceApprovalId,
              predictedDate,
              success,
              extra,
            })),
          ).to.deep.equal(
            [
              { date: '2020-03-16' },
              { date: '2020-03-17' },
              { date: '2020-03-18' },
              { date: '2020-03-19' },
              { date: '2020-03-20' },
              { date: '2020-03-21' },
              { date: '2020-03-22' },
              { date: '2020-03-23' },
            ].map(toPrediction),
          );
        },
      ),
    );

    it(
      'should return null if prediction request fails',
      replayHttp('machine-learning/predicted-payback/oracle/failed-request.json', async () => {
        const predictedPaybackDate = await MachineLearningDomain.predictPaybackDate({
          advanceApprovalId: advanceApproval.id,
          userId: advanceApproval.userId,
          bankAccountId: advanceApproval.bankAccountId,
        });

        expect(predictedPaybackDate).to.be.null;

        const predictions = await AdvancePaybackDatePrediction.findAll({
          where: { advanceApprovalId: advanceApproval.id },
        });

        expect(predictions).to.be.empty;
      }),
    );

    it(
      'should successfully return the earliest date that is above the prediction threshold',
      replayHttp(
        'machine-learning/predicted-payback/oracle/predictions-with-eligible-payback-date.json',
        async () => {
          const predictedPaybackDate = await MachineLearningDomain.predictPaybackDate({
            advanceApprovalId: advanceApproval.id,
            userId: advanceApproval.userId,
            bankAccountId: advanceApproval.bankAccountId,
          });

          expect(predictedPaybackDate).to.deep.eq(moment('2020-03-19'));

          const predictions = await AdvancePaybackDatePrediction.findAll({
            where: { advanceApprovalId: advanceApproval.id },
          });

          expect(predictions).to.have.length(8);
          expect(
            predictions.map(({ advanceApprovalId, predictedDate, success, extra }) => ({
              advanceApprovalId,
              predictedDate,
              success,
              extra,
            })),
          ).to.deep.equal(
            [
              { date: '2020-03-16' },
              { date: '2020-03-17' },
              { date: '2020-03-18' },
              { date: '2020-03-19', success: true },
              { date: '2020-03-20' },
              { date: '2020-03-21' },
              { date: '2020-03-22' },
              { date: '2020-03-23' },
            ].map(toPrediction),
          );
        },
      ),
    );

    it(
      'should successfully return the earliest date that is above the prediction threshold, even if on weekend',
      replayHttp(
        'machine-learning/predicted-payback/oracle/predictions-with-eligible-weekend-payback-date.json',
        async () => {
          const predictedPaybackDate = await MachineLearningDomain.predictPaybackDate({
            advanceApprovalId: advanceApproval.id,
            userId: advanceApproval.userId,
            bankAccountId: advanceApproval.bankAccountId,
          });

          expect(predictedPaybackDate).to.deep.eq(moment('2020-03-21'));

          const predictions = await AdvancePaybackDatePrediction.findAll({
            where: { advanceApprovalId: advanceApproval.id },
          });

          expect(predictions).to.have.length(8);
          expect(
            predictions.map(({ advanceApprovalId, predictedDate, success, extra }) => ({
              advanceApprovalId,
              predictedDate,
              success,
              extra,
            })),
          ).to.deep.equal(
            [
              { date: '2020-03-16' },
              { date: '2020-03-17' },
              { date: '2020-03-18' },
              { date: '2020-03-19' },
              { date: '2020-03-20' },
              { date: '2020-03-21', success: true },
              { date: '2020-03-22' },
              { date: '2020-03-23' },
            ].map(toPrediction),
          );
        },
      ),
    );

    it(
      'should use a different model if a config is provided',
      replayHttp(
        'machine-learning/predicted-payback/oracle/global-predictions-with-eligible-weekend-payback-date.json',
        async () => {
          const modelConfig = config.get<PredictedPaybackMlConfig>('ml.globalPredictedPayback');
          const predictedPaybackDate = await MachineLearningDomain.predictPaybackDate({
            advanceApprovalId: advanceApproval.id,
            userId: advanceApproval.userId,
            bankAccountId: advanceApproval.bankAccountId,
            modelConfig,
            strategy: Strategy.MOST_PROBABLE,
          });

          expect(predictedPaybackDate).to.deep.eq(moment('2020-03-22'));

          const predictions = await AdvancePaybackDatePrediction.findAll({
            where: { advanceApprovalId: advanceApproval.id },
          });

          expect(predictions).to.have.length(8);
          expect(
            predictions.map(({ advanceApprovalId, predictedDate, success, extra }) => ({
              advanceApprovalId,
              predictedDate,
              success,
              extra,
            })),
          ).to.deep.equal(
            [
              { date: '2020-03-16' },
              { date: '2020-03-17' },
              { date: '2020-03-18' },
              { date: '2020-03-19' },
              { date: '2020-03-20' },
              { date: '2020-03-21' },
              { date: '2020-03-22', success: true },
              { date: '2020-03-23' },
            ].map(o =>
              toPrediction({
                ...o,
                type: modelConfig.modelType,
                threshold: null,
                strategy: Strategy.MOST_PROBABLE,
              }),
            ),
          );
        },
      ),
    );
  });

  describe('getPredictedPaybackDate', () => {
    [
      {
        predictionRecord: { predictedDate: moment('2020-03-23'), success: true },
        expectedDate: moment('2020-03-23'),
      },
      {
        predictionRecord: { predictedDate: moment('2020-03-23'), success: false },
        expectedDate: null,
      },
    ].forEach(({ predictionRecord, expectedDate }) => {
      it('should only return predicted dates marked as successful', async () => {
        const prediction = await factory.create<AdvancePaybackDatePrediction>(
          'advance-payback-date-prediction',
          {
            ...predictionRecord,
          },
        );

        const date = await MachineLearningDomain.getPredictedPaybackDate(
          prediction.advanceApprovalId,
        );

        expect(date).to.deep.eq(expectedDate);
      });
    });

    it('should return null if there are no predictions found', async () => {
      const date = await MachineLearningDomain.getPredictedPaybackDate(1232132);

      expect(date).to.be.null;
    });
  });

  describe('MOST_PROBABLE', () => {
    it(
      'returns the highest scored date',
      replayHttp(
        'machine-learning/predicted-payback/oracle/predictions-with-eligible-weekend-payback-date.json',
        async () => {
          const predictedPaybackDate = await MachineLearningDomain.predictPaybackDate({
            advanceApprovalId: advanceApproval.id,
            userId: advanceApproval.userId,
            bankAccountId: advanceApproval.bankAccountId,
            strategy: Strategy.MOST_PROBABLE,
          });

          expect(predictedPaybackDate).to.deep.eq(moment('2020-03-22'));

          const predictions = await AdvancePaybackDatePrediction.findAll({
            where: { advanceApprovalId: advanceApproval.id },
          });

          expect(predictions).to.have.length(8);
          expect(
            predictions.map(({ advanceApprovalId, predictedDate, success, extra }) => ({
              advanceApprovalId,
              predictedDate,
              success,
              extra,
            })),
          ).to.deep.equal(
            [
              { date: '2020-03-16', strategy: Strategy.MOST_PROBABLE },
              { date: '2020-03-17', strategy: Strategy.MOST_PROBABLE },
              { date: '2020-03-18', strategy: Strategy.MOST_PROBABLE },
              { date: '2020-03-19', strategy: Strategy.MOST_PROBABLE },
              { date: '2020-03-20', strategy: Strategy.MOST_PROBABLE },
              { date: '2020-03-21', strategy: Strategy.MOST_PROBABLE },
              { date: '2020-03-22', success: true, strategy: Strategy.MOST_PROBABLE },
              { date: '2020-03-23', strategy: Strategy.MOST_PROBABLE },
            ].map(toPrediction),
          );
        },
      ),
    );

    it(
      'should return null if prediction request fails',
      replayHttp('machine-learning/predicted-payback/oracle/failed-request.json', async () => {
        const predictedPaybackDate = await MachineLearningDomain.predictPaybackDate({
          advanceApprovalId: advanceApproval.id,
          userId: advanceApproval.userId,
          bankAccountId: advanceApproval.bankAccountId,
          strategy: Strategy.MOST_PROBABLE,
        });

        expect(predictedPaybackDate).to.be.null;

        const predictions = await AdvancePaybackDatePrediction.findAll({
          where: { advanceApprovalId: advanceApproval.id },
        });

        expect(predictions).to.be.empty;
      }),
    );
  });
});
