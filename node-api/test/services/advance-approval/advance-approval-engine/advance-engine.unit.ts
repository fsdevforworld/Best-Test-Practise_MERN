import { expect } from 'chai';

import { NodeNames } from '../../../../src/services/advance-approval/advance-approval-engine/common';
import { buildAdvanceApprovalEngine } from '../../../../src/services/advance-approval/advance-approval-engine/build-engine';
import {
  DecisionNode,
  ExperimentDecisionNode,
  findByName,
} from '../../../../src/services/advance-approval/advance-approval-engine/decision-node';

describe('AdvanceEngine', () => {
  const engine = buildAdvanceApprovalEngine();

  it('starts with eligibilityNode', async () => {
    expect(engine.name).to.eq('Eligibility Node');
  });

  describe('EligibilityNode', () => {
    it('succeeds to accountAgeNode', async () => {
      expect(engine.onSuccessNode.name).to.eq('Account Age Node');
    });

    it('fails to null', async () => {
      expect(engine.onFailureNode).to.be.null;
    });
  });

  describe('LowIncomeNode', () => {
    const lowIncomeNodes = findByName(engine, NodeNames.LowIncomeNode);
    const lowIncomeNode = lowIncomeNodes[0];

    it('finds lowIncomeNode', async () => {
      expect(lowIncomeNodes.length).to.eq(1);
      expect(lowIncomeNode.name).to.eq(NodeNames.LowIncomeNode); // testing findByName
    });

    it('succeeds', async () => {
      expect(lowIncomeNode.onSuccessNode.name).to.eq('Payday Solvency Node');
    });
  });

  function traverseTreeForExperimentNodeFollowers(
    node: DecisionNode,
    shouldBeExperimental: boolean = false,
    allowedToBeExperimental: boolean = false,
  ) {
    const isExperimentDecisionNode = node instanceof ExperimentDecisionNode;

    if (shouldBeExperimental) {
      it(`${node.name} should be experimental`, () => {
        expect(node).to.exist;
        expect(node.isExperimental).to.eq(true);
      });
    } else if (!node) {
      return;
    } else if (!allowedToBeExperimental && !isExperimentDecisionNode) {
      it(`${node.name} cannot be experimental`, () => {
        expect(node.isExperimental).to.eq(false);
      });
    }

    traverseTreeForExperimentNodeFollowers(
      node.onSuccessNode,
      isExperimentDecisionNode,
      node.isExperimental,
    );
    traverseTreeForExperimentNodeFollowers(node.onFailureNode, false, node.isExperimental);
  }

  describe('Every node after an experiment gate should be experimental and no experimental nodes exist without experiment gates', () => {
    traverseTreeForExperimentNodeFollowers(engine);
  });
});
