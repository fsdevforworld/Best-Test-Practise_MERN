import { expect } from 'chai';
import { times } from 'lodash';
import { DateOnly } from '@dave-inc/time-lib';
import {
  _getScoreV2,
  _matchResultSorter,
  MOST_LIKELY_PARAM_GETTERS,
} from '../../../src/domain/recurring-transaction/detect-recurring-schedule';
import { MatchResult } from '../../../src/typings';
import { RecurringTransactionInterval } from '@dave-inc/wire-typings';

describe('detect recurring schedule', () => {
  describe('group semi-monthly dates', async () => {
    it('should group rigidly patterned semi-monthly dates', () => {
      const dates = [
        new DateOnly(2019, 9, 13),
        new DateOnly(2019, 9, 21),
        new DateOnly(2019, 10, 13),
        new DateOnly(2019, 10, 21),
        new DateOnly(2019, 11, 13),
      ];
      const grouped = MOST_LIKELY_PARAM_GETTERS[RecurringTransactionInterval.SEMI_MONTHLY](dates);
      expect(grouped.length).to.equal(1);
      expect(grouped[0].params).to.deep.equal([13, 21]);
    });

    it('should cluster only two dates properly', () => {
      const dates = [new DateOnly(2019, 9, 1), new DateOnly(2019, 9, 15)];
      const grouped = MOST_LIKELY_PARAM_GETTERS[RecurringTransactionInterval.SEMI_MONTHLY](dates);
      expect(grouped.length).to.equal(1);
      expect(grouped[0].params).to.deep.equal([1, 15]);
    });

    it('should return no result with only one date', () => {
      const dates = [
        new DateOnly(2019, 9, 13),
        new DateOnly(2019, 10, 13),
        new DateOnly(2019, 11, 13),
      ];
      const grouped = MOST_LIKELY_PARAM_GETTERS[RecurringTransactionInterval.SEMI_MONTHLY](dates);
      expect(grouped.length).to.equal(0);
    });

    it('should return no result with very close dates', () => {
      const dates = [
        new DateOnly(2019, 9, 13),
        new DateOnly(2019, 10, 15),
        new DateOnly(2019, 11, 10),
      ];
      const grouped = MOST_LIKELY_PARAM_GETTERS[RecurringTransactionInterval.SEMI_MONTHLY](dates);
      expect(grouped.length).to.equal(0);
    });

    it('should return result with fuzzy date clustering', () => {
      const dates = [
        new DateOnly(2019, 9, 13),
        new DateOnly(2019, 9, 21),
        new DateOnly(2019, 10, 15),
        new DateOnly(2019, 10, 20),
        new DateOnly(2019, 11, 15),
        new DateOnly(2019, 11, 22),
        new DateOnly(2019, 12, 13),
        new DateOnly(2019, 12, 21),
      ];
      const grouped = MOST_LIKELY_PARAM_GETTERS[RecurringTransactionInterval.SEMI_MONTHLY](dates);
      expect(grouped.length).to.be.gte(1);
      expect(grouped[0].params).to.deep.equal([13, 21]);
    });

    it('should never fail detecting a result with fuzzy date clustering', () => {
      const dates = [
        new DateOnly(2019, 9, 13),
        new DateOnly(2019, 9, 21),
        new DateOnly(2019, 10, 15),
        new DateOnly(2019, 10, 20),
        new DateOnly(2019, 11, 15),
        new DateOnly(2019, 11, 22),
        new DateOnly(2019, 12, 13),
        new DateOnly(2019, 12, 21),
      ];
      const numIterations = 1000;
      let numWithResult = 0;
      times(numIterations, () => {
        const grouped = MOST_LIKELY_PARAM_GETTERS[RecurringTransactionInterval.SEMI_MONTHLY](dates);
        if (grouped.length > 0) {
          numWithResult += 1;
        }
      });
      expect(numWithResult).to.equal(numIterations);
    });

    it('should never fail detecting a schedule with two properly spaced unique dates', () => {
      const dates = [
        new DateOnly(2019, 9, 1),
        new DateOnly(2019, 9, 15),
        new DateOnly(2019, 10, 1),
        new DateOnly(2019, 10, 15),
        new DateOnly(2019, 11, 1),
        new DateOnly(2019, 11, 15),
      ];
      const numIterations = 1000;
      let numWithResult = 0;
      times(numIterations, () => {
        const grouped = MOST_LIKELY_PARAM_GETTERS[RecurringTransactionInterval.SEMI_MONTHLY](dates);
        if (grouped.length > 0) {
          numWithResult += 1;
        }
      });
      expect(numWithResult).to.equal(numIterations);
    });
  });

  describe('sort match results', () => {
    it('should sort match results with unmatched days lower', () => {
      const matched = {
        matchPairs: [
          {
            observed: new DateOnly(2020, 1, 15),
            predicted: new DateOnly(2020, 1, 15),
            diff: 0,
          },
          {
            observed: new DateOnly(2020, 2, 15),
            predicted: new DateOnly(2020, 2, 15),
            diff: 0,
          },
        ],
        unmatched: [] as DateOnly[],
        numPredictions: 2,
      } as MatchResult;
      const unmatched = {
        matchPairs: matched.matchPairs,
        unmatched: [new DateOnly(2019, 12, 15)],
        numPredictions: 3,
      } as MatchResult;

      expect(_matchResultSorter(matched, unmatched)).to.be.lt(0);
    });

    it('should sort match results with more matches higher', () => {
      const matches = {
        matchPairs: [
          {
            observed: new DateOnly(2020, 1, 15),
            predicted: new DateOnly(2020, 1, 15),
            diff: 0,
          },
          {
            observed: new DateOnly(2020, 2, 15),
            predicted: new DateOnly(2020, 2, 15),
            diff: 0,
          },
        ],
        unmatched: [] as DateOnly[],
        numPredictions: 2,
      } as MatchResult;
      const moreMatches = {
        matchPairs: matches.matchPairs.concat({
          observed: new DateOnly(2020, 3, 15),
          predicted: new DateOnly(2020, 3, 15),
          diff: 0,
        }),
        unmatched: [] as DateOnly[],
        numPredictions: 3,
      } as MatchResult;

      expect(_matchResultSorter(matches, moreMatches)).to.be.gt(0);
    });

    it('should sort match results with exact matches over fuzzy matches', () => {
      const exactMatch = {
        matchPairs: [
          {
            observed: new DateOnly(2020, 1, 15),
            predicted: new DateOnly(2020, 1, 15),
            diff: 0,
          },
          {
            observed: new DateOnly(2020, 2, 15),
            predicted: new DateOnly(2020, 2, 15),
            diff: 0,
          },
        ],
        unmatched: [] as DateOnly[],
        numPredictions: 2,
      } as MatchResult;

      const fuzzyMatch = {
        matchPairs: [
          {
            observed: new DateOnly(2020, 1, 15),
            predicted: new DateOnly(2020, 1, 15),
            diff: 1,
          },
          {
            observed: new DateOnly(2020, 2, 16),
            predicted: new DateOnly(2020, 2, 15),
            diff: 0,
          },
        ],
        unmatched: [] as DateOnly[],
        numPredictions: 2,
      } as MatchResult;

      expect(_matchResultSorter(exactMatch, fuzzyMatch)).to.be.lt(0);
    });

    it('should sort match results more recent exact match higher', () => {
      const earlierFuzzy = {
        matchPairs: [
          {
            observed: new DateOnly(2020, 1, 16),
            predicted: new DateOnly(2020, 1, 15),
            diff: 0,
          },
          {
            observed: new DateOnly(2020, 2, 15),
            predicted: new DateOnly(2020, 2, 15),
            diff: 0,
          },
        ],
        unmatched: [] as DateOnly[],
        numPredictions: 2,
      } as MatchResult;

      const recentFuzzy = {
        matchPairs: [
          {
            observed: new DateOnly(2020, 1, 15),
            predicted: new DateOnly(2020, 1, 15),
            diff: 1,
          },
          {
            observed: new DateOnly(2020, 2, 16),
            predicted: new DateOnly(2020, 2, 15),
            diff: 0,
          },
        ],
        unmatched: [] as DateOnly[],
        numPredictions: 2,
      } as MatchResult;

      expect(_matchResultSorter(earlierFuzzy, recentFuzzy)).to.be.lt(0);
    });
  });

  describe('result scorer', () => {
    it('should score match results with unmatched days lower', () => {
      const matchPairs = [
        {
          observed: new DateOnly(2020, 1, 15),
          predicted: new DateOnly(2020, 1, 15),
          diff: 0,
        },
        {
          observed: new DateOnly(2020, 2, 15),
          predicted: new DateOnly(2020, 2, 15),
          diff: 0,
        },
      ];
      const scoreMatched = _getScoreV2(matchPairs, []);
      const scoreUnmatched = _getScoreV2(matchPairs, [new DateOnly(2019, 12, 15)]);

      expect(scoreMatched).to.be.gt(scoreUnmatched);
    });

    it('should score match results with exact matches over fuzzy matches', () => {
      const exactMatch = [
        {
          observed: new DateOnly(2020, 1, 15),
          predicted: new DateOnly(2020, 1, 15),
          diff: 0,
        },
        {
          observed: new DateOnly(2020, 2, 15),
          predicted: new DateOnly(2020, 2, 15),
          diff: 0,
        },
      ];
      const fuzzyMatch = [
        {
          observed: new DateOnly(2020, 1, 15),
          predicted: new DateOnly(2020, 1, 15),
          diff: 1,
        },
        {
          observed: new DateOnly(2020, 2, 16),
          predicted: new DateOnly(2020, 2, 15),
          diff: 0,
        },
      ];

      const scoreExactMatch = _getScoreV2(exactMatch, []);
      const scoreFuzzyMatch = _getScoreV2(fuzzyMatch, []);

      expect(scoreExactMatch).to.be.gt(scoreFuzzyMatch);
    });

    it('should score match results more recent exact match higher', () => {
      const earlyFuzzy = [
        {
          observed: new DateOnly(2020, 1, 16),
          predicted: new DateOnly(2020, 1, 15),
          diff: 0,
        },
        {
          observed: new DateOnly(2020, 2, 15),
          predicted: new DateOnly(2020, 2, 15),
          diff: 0,
        },
      ];

      const recentFuzzy = [
        {
          observed: new DateOnly(2020, 1, 15),
          predicted: new DateOnly(2020, 1, 15),
          diff: 1,
        },
        {
          observed: new DateOnly(2020, 2, 16),
          predicted: new DateOnly(2020, 2, 15),
          diff: 0,
        },
      ];

      const scoreEarlyFuzzy = _getScoreV2(earlyFuzzy, []);
      const scoreRecentFuzzy = _getScoreV2(recentFuzzy, []);

      expect(scoreEarlyFuzzy).to.be.gt(scoreRecentFuzzy);
    });

    it('should have a minimum score of 0', () => {
      const badMatchScore = _getScoreV2([], [new DateOnly(2020, 1, 1), new DateOnly(2020, 1, 15)]);
      expect(badMatchScore).to.equal(0);
    });
  });
});
