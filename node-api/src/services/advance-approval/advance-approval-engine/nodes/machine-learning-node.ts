import { isEmpty, isNil, isObject, keys, values } from 'lodash';
import { InvalidParametersError } from '@dave-inc/error-types';
import {
  AdvanceApprovalResult,
  ApprovalDict,
  CalculatedScore,
  DecisionNodeType,
  DynamicScoreLimits,
  ScoreLimitConfig,
  UnderwritingModelConfigKey,
  UnderwritingScoreLimits,
} from '../../types';
import { getUnderwritingModelConfig } from '../../machine-learning';
import { getModelCase, ScoreLimitGenerator } from '../cases';
import buildNode from './configurable-node';

export function isDynamicLimit(
  scoreLimitConfig: ScoreLimitConfig,
): scoreLimitConfig is DynamicScoreLimits {
  return (
    isObject(scoreLimitConfig) &&
    !isEmpty(scoreLimitConfig) &&
    isObject(values(scoreLimitConfig)[0])
  );
}

function buildDynamicScoreGenerator(scoreLimitConfig: DynamicScoreLimits): ScoreLimitGenerator {
  // Dynamic score limits are based on number of advances / overdrafts taken so far
  // Sort configured taken counts in reverse order. We'll scan through these and
  // take the first score limit config where the configured taken count <= the user's actual taken
  // count
  const configuredTakenCounts = keys(scoreLimitConfig)
    .map(Number)
    .sort((v0: number, v1: number) => v1 - v0);

  return (dict: ApprovalDict) => {
    const numTaken = dict.advanceSummary.totalAdvancesTaken;
    const scoreLimitKey = configuredTakenCounts.find(
      configuredTaken => configuredTaken <= numTaken,
    );
    const scoreLimits = scoreLimitConfig[`${scoreLimitKey}`];
    if (isNil(scoreLimits)) {
      throw new InvalidParametersError(
        `No score limit configuration matches user taken count ${numTaken}`,
      );
    }
    return scoreLimits;
  };
}

export function buildScoreGenerator(
  scoreLimitConfig: ScoreLimitConfig,
): ScoreLimitGenerator | UnderwritingScoreLimits {
  if (scoreLimitConfig === CalculatedScore) {
    throw new InvalidParametersError('Cannot build score generator from config');
  } else if (isDynamicLimit(scoreLimitConfig)) {
    return buildDynamicScoreGenerator(scoreLimitConfig);
  } else {
    // static UnderwritingScoreLimits
    return scoreLimitConfig;
  }
}

/**
 * Node is responsible for all machine learning approvals, based on the provided model type and score limits
 *
 * @param {string} name
 * @param {UnderwritingModelConfigKey} modelConfigKey
 * @param {(dict: ApprovalDict, prev: AdvanceApprovalResult | null) => AdvanceApprovalResult} afterAllCases
 * @param {(dict: ApprovalDict) => { []}
 * @returns {DecisionNode}
 */
export default function buildMachineLearningNode({
  name,
  modelConfigKey,
  afterAllCases,
  dynamicScoreLimits,
  isExperimental = false,
}: {
  name: string;
  modelConfigKey: UnderwritingModelConfigKey;
  isExperimental?: boolean;
  afterAllCases?: (
    dict: ApprovalDict,
    prev: AdvanceApprovalResult | null,
  ) => AdvanceApprovalResult | Promise<AdvanceApprovalResult>;
  dynamicScoreLimits?: ScoreLimitGenerator;
}) {
  const config = getUnderwritingModelConfig(modelConfigKey);
  const scoreLimitGenerator = dynamicScoreLimits ?? buildScoreGenerator(config.scoreLimits);

  return buildNode({
    name,
    type: DecisionNodeType.MachineLearning,
    isExperimental,
    metadata: { config },
    cases: [getModelCase(name, config.modelType, scoreLimitGenerator, config.oracle)],
    afterAllCases,
    onError: (errors, dict, prev) => {
      return {
        ...prev,
        rejectionReasons: prev.rejectionReasons ? prev.rejectionReasons.concat(errors) : errors,
      };
    },
  });
}
