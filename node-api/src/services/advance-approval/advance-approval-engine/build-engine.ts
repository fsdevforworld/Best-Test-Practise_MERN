import { DecisionNode } from './decision-node';

import {
  AccountAgeNode,
  buildIncomeValidationNode,
  DaveBankingModelEligibilityNode,
  EligibilityNode,
  ExistingIncomeTimingNode,
  IsDaveBankingNode,
  LowIncomeNode,
  PaydaySolvencyNode,
  buildAccountAgeFailureML,
  buildDaveBankingML,
  buildIncomeValidationSuccessML,
  buildIncomeValidationFailureML,
} from './nodes';
import { incomeValidationSingleObservationExperimentGate } from './experiments/experiment-gates';

import MLDidErrorNode from './nodes/ml-did-error-node';

/**
 * Builds the graph of nodes that make up our underwriting engine
 *
 * @param {boolean | undefined} useMachineLearning
 * @returns {DecisionNode}
 */
export function buildAdvanceApprovalEngine(): DecisionNode {
  const eligibilityNode = new EligibilityNode();
  const accountAgeNode = new AccountAgeNode();
  const hasValidIncomeNode = buildIncomeValidationNode();
  const hasValidIncomeIncludingSingleObservationNode = buildIncomeValidationNode({
    includeSingleObservationIncome: true,
    isExperimental: true,
  });
  const incomeTimingNode = new ExistingIncomeTimingNode();
  const lowIncomeNode = new LowIncomeNode();
  const solvencyNode = new PaydaySolvencyNode();

  eligibilityNode
    .onSuccess(accountAgeNode)
    .onSuccess(incomeValidationSingleObservationExperimentGate)
    .onSuccess(hasValidIncomeIncludingSingleObservationNode)
    .onSuccess(incomeTimingNode);

  incomeValidationSingleObservationExperimentGate.onFailure(hasValidIncomeNode);
  hasValidIncomeNode.onSuccess(incomeTimingNode);

  // Machine Learning
  // model failure cases. If ML hard errors go to old static rules
  const mlDidErrorNode = new MLDidErrorNode();
  mlDidErrorNode.onSuccess(lowIncomeNode).onSuccess(solvencyNode);

  accountAgeNode.onFailure(buildAccountAgeFailureML());

  const incomeValidationFailureML = buildIncomeValidationFailureML();
  hasValidIncomeNode.onFailure(incomeValidationFailureML);
  hasValidIncomeIncludingSingleObservationNode.onFailure(incomeValidationFailureML);

  const incomeValidationSuccessML = buildIncomeValidationSuccessML(mlDidErrorNode);

  // dave banking $200 model
  const isDaveBankingNode = new IsDaveBankingNode();
  const daveBankingModelEligibilityNode = new DaveBankingModelEligibilityNode();
  incomeTimingNode.onSuccess(isDaveBankingNode);

  isDaveBankingNode.onSuccess(daveBankingModelEligibilityNode);
  isDaveBankingNode.onFailure(incomeValidationSuccessML);
  daveBankingModelEligibilityNode.onFailure(incomeValidationSuccessML);

  const daveBankingML = buildDaveBankingML(mlDidErrorNode);
  daveBankingModelEligibilityNode.onSuccess(daveBankingML);

  return eligibilityNode;
}

/**
 * Get simplified approval engine for frontend rules
 */
export function buildRulesApprovalFlow(): DecisionNode {
  const eligibilityNode = new EligibilityNode();
  const accountAgeNode = new AccountAgeNode();
  const hasValidIncomeNode = buildIncomeValidationNode();
  const incomeTimingNode = new ExistingIncomeTimingNode();
  const lowIncomeNode = new LowIncomeNode();
  const solvencyNode = new PaydaySolvencyNode();

  eligibilityNode
    .onSuccess(accountAgeNode)
    .onSuccess(hasValidIncomeNode)
    .onSuccess(incomeTimingNode)
    .onSuccess(lowIncomeNode)
    .onSuccess(solvencyNode);

  return eligibilityNode;
}
