import { expect } from 'chai';
import * as sinon from 'sinon';

import { fakeDateTime, replayHttp } from '../../test-helpers';

import * as MachineLearningDomain from '../../../src/services/advance-approval/machine-learning';
import { getUnderwritingModelConfig } from '../../../src/services/advance-approval/machine-learning';

import { moment } from '@dave-inc/time-lib';
import { UnderwritingModelConfigKey } from '../../../src/services/advance-approval/types';

describe('Machine Learning - Underwriting', async () => {
  const sandbox = sinon.createSandbox();
  const now = moment('2020-06-11');

  beforeEach(() => {
    fakeDateTime(sandbox, now);
  });

  afterEach(() => sandbox.restore());

  describe('getUnderwritingMlScore', () => {
    [
      {
        testCase: 'should successfully generate a score',
        fixture: 'machine-learning/underwriting/oracle/score-created.json',
        cacheOnly: false,
        expected: {
          score: 0.83249,
          metadata: {
            cached_at: null,
            cached_from: null,
          },
        },
      },
      {
        testCase: 'should successfully return a cached score',
        fixture: 'machine-learning/underwriting/oracle/cached-score.json',
        cacheOnly: false,
        expected: {
          score: 0.43692,
          metadata: {
            cached_at: '2020-06-10T23:19:50.294Z',
            cached_from: 'background_scoring',
          },
        },
      },
      {
        testCase: 'should successfully return a cached score when cache only is true',
        fixture: 'machine-learning/underwriting/oracle/cache-only-request.json',
        cacheOnly: true,
        expected: {
          score: 0.723521,
          metadata: {
            cached_at: '2020-06-12T23:19:50.294Z',
            cached_from: 'background_scoring',
          },
        },
      },
      {
        testCase: 'should bubble up errors when requests fail',
        fixture: 'machine-learning/underwriting/oracle/failed-request.json',
        cacheOnly: false,
        expected: new Error('Request failed with status code 500'),
      },
    ].forEach(({ testCase, fixture, cacheOnly, expected }) => {
      it(
        testCase,
        replayHttp(fixture, async () => {
          let errorThrown: Error;

          const { modelType, oracle: oracleConfig } = getUnderwritingModelConfig(
            UnderwritingModelConfigKey.IncomeValidationFailureGMV1,
          );

          try {
            const response = await MachineLearningDomain.getUnderwritingMlScore(
              {
                userId: 1,
                bankAccountId: 1,
                paybackDate: moment('2020-06-19'),
                modelType,
                cacheOnly,
              },
              { oracleConfig },
            );

            expect(response).to.deep.equal(expected);
          } catch (err) {
            errorThrown = err;
          }

          if (expected instanceof Error) {
            expect(errorThrown).to.exist;
            expect(errorThrown.message).to.eq(expected.message);
          } else {
            expect(errorThrown).to.not.exist;
          }
        }),
      );
    });
  });
});
