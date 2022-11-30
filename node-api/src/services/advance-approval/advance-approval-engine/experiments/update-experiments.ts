import { UpdateExperimentsParams } from '../../../../lib/advance-approval-client';
import { AdvanceExperimentLog } from '../../../../models';
import * as Bluebird from 'bluebird';
import { Op } from 'sequelize';
import { DecisionNode, ExperimentDecisionNode } from '../decision-node';
import * as AdvanceApprovalEngine from '../build-engine';
import { uniqBy } from 'lodash';

export async function updateAdvanceExperiments({
  advanceId,
  advanceApprovalId,
}: UpdateExperimentsParams) {
  if (advanceApprovalId) {
    const advanceExperiments = getAdvanceExperiments();

    await AdvanceExperimentLog.update({ advanceId }, { where: { advanceApprovalId } });

    const experimentLogs = await AdvanceExperimentLog.findAll({
      where: { advanceApprovalId },
    });

    await Bluebird.each(advanceExperiments, async experimentNode => {
      const matchingLogs = experimentLogs.filter(log => {
        return log.advanceExperimentId === experimentNode.id;
      });
      await Bluebird.each(matchingLogs, async log => {
        const previousExperimentSuccessCount = await AdvanceExperimentLog.count({
          where: {
            advanceExperimentId: log.advanceExperimentId,
            userId: log.userId,
            success: true,
            advanceId: {
              [Op.and]: [{ [Op.ne]: null }, { [Op.ne]: advanceId }],
            },
          },
        });
        const isFirstAdvanceForExperiment = previousExperimentSuccessCount === 0;

        return experimentNode.onAdvanceCreated({
          advanceId,
          experimentLog: log,
          isFirstAdvanceForExperiment,
        });
      });
    });
  }
}

/**
 * Returns all advance experiment nodes
 *
 * @returns {ExperimentDecisionNode[]}
 */
export function getAdvanceExperiments(): ExperimentDecisionNode[] {
  const rootUnderwritingDecisionNode = AdvanceApprovalEngine.buildAdvanceApprovalEngine();

  return findExperimentDecisionNodes(rootUnderwritingDecisionNode);
}

/**
 * Traverses the decision node tree. Use from the root.
 */
export function findExperimentDecisionNodes<D, R>(
  node: DecisionNode | ExperimentDecisionNode,
): ExperimentDecisionNode[] {
  const output: ExperimentDecisionNode[] = [];

  if (isExperimentDecisionNode(node)) {
    output.push(node);
  }

  const childNodes = [];
  if (node.onSuccessNode) {
    childNodes.push(...findExperimentDecisionNodes(node.onSuccessNode));
  }

  if (node.onFailureNode) {
    childNodes.push(...findExperimentDecisionNodes(node.onFailureNode));
  }

  // Different children can have the same child each output needs to be unique
  childNodes.forEach(child => {
    if (output.indexOf(child) < 0) {
      output.push(child);
    }
  });

  return uniqBy(output, experiment => experiment.name);
}

function isExperimentDecisionNode(node: any): node is ExperimentDecisionNode {
  return Boolean(node.isExperimentDecisionNode);
}
