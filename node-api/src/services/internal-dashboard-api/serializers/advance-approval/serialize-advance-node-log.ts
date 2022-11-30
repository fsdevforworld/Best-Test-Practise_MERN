import { kebabCase } from 'lodash';
import { AdvanceNodeLog } from '../../../../models';
import { serializeDate } from '../../../../serialization';

import { IApiResourceObject, IRawRelationships } from '../../../../typings';
import serializeRelationships from '../serialize-relationships';
import serialize from '../serialize';

interface IAdvanceNodeLogResource extends IApiResourceObject {
  type: 'advance-node-log';
  attributes: {
    name: string;
    isMl: boolean;
    isExperimental: boolean;
    success: boolean;
    created: string;
  };
}

const serializeNextNodeData = (nodeLog: AdvanceNodeLog) => {
  if (
    (nodeLog.success && !nodeLog.successNodeName) ||
    (!nodeLog.success && !nodeLog.failureNodeName)
  ) {
    return null;
  }

  const nextNodeName = nodeLog.success ? nodeLog.successNodeName : nodeLog.failureNodeName;
  const nextNodeId = `${kebabCase(nextNodeName)}-${nodeLog.advanceApprovalId}`;

  return { type: 'advance-node-log', id: nextNodeId };
};

const serializeAdvanceNodeLog: serialize<AdvanceNodeLog, IAdvanceNodeLogResource> = async (
  nodeLog: AdvanceNodeLog,
  relationships?: IRawRelationships,
) => {
  return {
    type: 'advance-node-log',
    id: `${kebabCase(nodeLog.name)}-${nodeLog.advanceApprovalId}`,
    attributes: {
      name: nodeLog.name,
      success: nodeLog.success,
      created: serializeDate(nodeLog.created),
      isExperimental: nodeLog.approvalResponse.isExperimental || false,
      isMl: nodeLog.approvalResponse.isMl || false,
    },
    relationships: {
      ...serializeRelationships(relationships),
      nextNodeLog: { data: serializeNextNodeData(nodeLog) },
    },
  };
};

export { IAdvanceNodeLogResource };
export default serializeAdvanceNodeLog;
