import { DecisionNode } from '../decision-node';
import { DecisionNodeType } from '../../types';
import { getExpectedDateForNoIncome } from '../';

import { NodeNames } from '../common';

import buildNode from './configurable-node';
import {
  hasIncomeCase,
  incomeCannotBeMissedCase,
  incomeCannotBeWaitingForFirstMatchCase,
  incomeCannotHaveInvalidNameCase,
  incomeMustBeValidCase,
  incomeMustHaveOccurredRecentlyCase,
} from '../cases';

/**
 * Node determines if user has a valid source of income that we can advance
 *
 * @param {boolean} includeSingleObservationIncome
 * @param {boolean} isExperimental
 * @returns {DecisionNode}
 */
export default function buildIncomeValidationNode({
  includeSingleObservationIncome = false,
  isExperimental = false,
}: { includeSingleObservationIncome?: boolean; isExperimental?: boolean } = {}): DecisionNode {
  const name = includeSingleObservationIncome
    ? NodeNames.IncomeValidationNodeV2
    : NodeNames.IncomeValidationNode;
  const cases = [
    hasIncomeCase(),
    incomeCannotBeWaitingForFirstMatchCase(),
    incomeCannotHaveInvalidNameCase(),
    incomeMustBeValidCase({ includeSingleObservationIncome }),
    incomeCannotBeMissedCase(),
    incomeMustHaveOccurredRecentlyCase(),
  ];

  return buildNode({
    name,
    type: DecisionNodeType.Static,
    isExperimental,
    cases,
    metadata: { includeSingleObservationIncome },
    getNodeRuleDescriptionInfo: () => [
      {
        nodeName: name,
        matchingCases: cases.map(nodeCase => nodeCase.name),
        explicitDescription:
          "I've gotten two paychecks deposited from the same employer on a regular schedule",
        vagueDescription:
          "I've gotten multiple paychecks deposited from the same employer on a regular schedule",
      },
    ],
    onError: (errors, approvalDict, prev) => {
      return {
        ...prev,
        approvedAmounts: [],
        rejectionReasons: prev?.rejectionReasons ? prev.rejectionReasons.concat(errors) : errors,
        defaultPaybackDate: getExpectedDateForNoIncome(approvalDict.today),
        incomeValid: false,
      };
    },
    afterAllCases: (approvalDict, prev) => {
      return {
        ...prev,
        incomeValid: true,
      };
    },
  });
}
