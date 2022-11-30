import { isNil } from 'lodash';
import ExperimentGateNode from './experiment-gate-node';
import { ExperimentId } from './experiment-ids';
import { CounterConfig } from './';
import { NodeNames } from '../common';
import * as config from 'config';
import logger from '../../../../lib/logger';
import { RecurringTransactionStatus } from '../../../../typings';
import { AdvanceNodeLog } from '../../../../models';

export const incomeValidationSingleObservationExperimentConfig = config.get<{
  active: boolean;
}>('ml.underwriting.incomeValidationNodeSingleObservation.experiment');
export const incomeValidationSingleObservationExperimentGate = new ExperimentGateNode({
  id: ExperimentId.IncomeValidationSingleObservationExperiment,
  name: 'income_validation_single_observation',
  description: 'This experiment will advance income that has been observed once.',
  active: incomeValidationSingleObservationExperimentConfig.active,
  ratio: 1,
  customLimiter: async approvalDict => {
    return approvalDict.recurringIncome?.status === RecurringTransactionStatus.SINGLE_OBSERVATION;
  },
  isSuccessful: async ({ approvalDict }) => {
    return didApprovalSuccessfullyPassNode(
      approvalDict.approvalId,
      NodeNames.IncomeValidationNodeV2,
    );
  },
});

/* Given the name of a node, builds an experiment gate for that node.
 *
 * By default, count success only if given node is evaluated as success,
 * and counts the limit on a per-user basis
 */
export function buildExperimentGateNode({
  experimentId,
  nodeName,
  description,
  isActive,
  ratio,
  limit,
}: {
  experimentId: ExperimentId;
  nodeName: string;
  description: string;
  isActive?: boolean;
  ratio?: number;
  limit?: number;
}): ExperimentGateNode {
  logger.debug('building underwriting experiment node', {
    nodeName,
    isActive,
    ratio,
    limit,
  });

  let counter: CounterConfig | undefined;
  if (!isNil(limit)) {
    counter = {
      limit,
      incrementOnAdvanceCreated: async ({ experimentLog, isFirstAdvanceForExperiment }) =>
        experimentLog.success && isFirstAdvanceForExperiment,
    };
  }

  return new ExperimentGateNode({
    id: experimentId,
    name: `${nodeName}-gate`,
    description,
    active: isActive,
    ratio,
    isSuccessful: async ({ approvalDict }) => {
      return didApprovalSuccessfullyPassNode(approvalDict.approvalId, nodeName);
    },
    counter,
  });
}

/**
 * Determines if the provided advance approval successfully passed a given approval node
 *
 * @param {number} advanceApprovalId
 * @param {string} nodeName
 * @returns {Promise<boolean>}
 */
async function didApprovalSuccessfullyPassNode(
  advanceApprovalId: number,
  nodeName: string,
): Promise<boolean> {
  return Boolean(
    await AdvanceNodeLog.findOne({
      where: {
        advanceApprovalId,
        name: nodeName,
        success: true,
      },
    }),
  );
}
