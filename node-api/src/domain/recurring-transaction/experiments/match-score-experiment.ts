import { buildExperiment } from '../../../experiments/experiment';
import {
  RSCHED_CONFIDENCE_THRESHOLD,
  RSCHED_CONFIDENCE_EXPERIMENT_THRESHOLD,
  RSCHED_MATCH_SCORE_EXPERIMENT_THRESHOLD,
} from '../constants';
import { MatchResult } from '../../../typings';

export enum EXPERIMENT_CASE {
  CONTROL = 'regular_confidence_threshold',
  MATCH_SCORE_V2_THRESHOLD_75 = 'match_score_v2_threshold_75',
  CONFIDENCE_THRESHOLD_75 = 'confidence_threshold_75',
}

export const FILTERS = {
  regular_confidence_threshold: (match: MatchResult) =>
    match.confidence > RSCHED_CONFIDENCE_THRESHOLD,
  match_score_v2_threshold_75: (match: MatchResult) =>
    match.matchScore > RSCHED_MATCH_SCORE_EXPERIMENT_THRESHOLD,
  confidence_threshold_75: (match: MatchResult) =>
    match.confidence > RSCHED_CONFIDENCE_EXPERIMENT_THRESHOLD,
};

type ExperimentResult = {
  filter: (match: MatchResult) => boolean;
  experimentCase: EXPERIMENT_CASE;
};

export async function runMatchScoreExperiment(userId: number): Promise<ExperimentResult> {
  const experiment = getExperiment(userId);
  const experimentCase = await experiment.getResult();
  return getFilter(experimentCase);
}

export async function getControl() {
  return getFilter(EXPERIMENT_CASE.CONTROL);
}

function getFilter(experimentCase: EXPERIMENT_CASE) {
  return {
    filter: FILTERS[experimentCase],
    experimentCase,
  };
}

function getExperiment(userId: number) {
  return buildExperiment<EXPERIMENT_CASE>(userId, {
    name: 'rsched_match_score_experiment',
    limit: 10000,
    controlValue: EXPERIMENT_CASE.CONTROL,
    experimentValues: [
      {
        experimentValue: EXPERIMENT_CASE.MATCH_SCORE_V2_THRESHOLD_75,
        ratio: 0.33,
      },
      {
        experimentValue: EXPERIMENT_CASE.CONFIDENCE_THRESHOLD_75,
        ratio: 0.33,
      },
    ],
  });
}
