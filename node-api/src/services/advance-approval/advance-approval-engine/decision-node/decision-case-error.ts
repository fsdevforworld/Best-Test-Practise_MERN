import { DecisionCaseError } from '../../types';

type DecisionCaseErrorParams = {
  path?: string;
  extra?: any;
  status?: string;
  displayMessage?: string; // Overrides front-end template prefix text if set.
};

export function getDecisionCaseError<T>(
  type: string,
  message?: string,
  params?: DecisionCaseErrorParams,
): DecisionCaseError {
  return {
    type,
    message,
    ...params,
  };
}
