import { flatMap } from 'lodash';

import { buildAdvanceApprovalEngine } from './build-engine';
import { getFormattedCaseName } from './common';

import { DecisionNode } from './decision-node';
import { DecisionNodeType } from '../types';

export type AdvanceApprovalEngineNodeJSON = {
  referenceId: string;
  name: string;
  metadata: { [key: string]: any };
  rules: string[];
  type: DecisionNodeType;
};

export type AdvanceApprovalEngineEdgeJSON = {
  source: string;
  target: string;
  name: string;
};

export type AdvanceApprovalEngineJSON = {
  nodes: AdvanceApprovalEngineNodeJSON[];
  edges: AdvanceApprovalEngineEdgeJSON[];
};

/**
 * Generates a JSON representation of our underwriting engine, with a list of unique nodes and the edges
 *
 * @param {DecisionNode} node
 * @returns {AdvanceApprovalEngineJSON}
 */
export function generateAdvanceApprovalEngineJSON(
  node: DecisionNode = buildAdvanceApprovalEngine(),
): AdvanceApprovalEngineJSON {
  const nodes: AdvanceApprovalEngineNodeJSON[] = [];
  const edges: AdvanceApprovalEngineEdgeJSON[] = [];

  const nodesToVisit = [node];

  while (nodesToVisit.length) {
    const currentNode = nodesToVisit.pop();

    nodes.push({
      referenceId: currentNode.referenceId,
      name: currentNode.name,
      metadata: currentNode.metadata,
      rules: currentNode.cases.map(nodeCase => getFormattedCaseName(nodeCase)),
      type: currentNode.type,
    });

    const possibleChildren = [
      { childNode: currentNode.onSuccessNode, edgeName: 'success' },
      { childNode: currentNode.onFailureNode, edgeName: 'failure' },
    ];

    possibleChildren
      .filter(({ childNode }) => Boolean(childNode))
      .forEach(({ childNode, edgeName }) => {
        const pendingOrVisitedNode = [...nodes, ...nodesToVisit].some(
          ({ referenceId }) => referenceId === childNode.referenceId,
        );
        if (!pendingOrVisitedNode) {
          nodesToVisit.push(childNode);
        }

        edges.push({
          source: currentNode.referenceId,
          target: childNode.referenceId,
          name: edgeName,
        });
      });
  }

  return { nodes, edges };
}

function generateDOTEdge(
  parent: AdvanceApprovalEngineNodeJSON,
  child: AdvanceApprovalEngineNodeJSON,
  label: string,
  color: string,
): string[] {
  const getNodeLabel = (node: AdvanceApprovalEngineNodeJSON) => {
    let nodeLabel = node.name;
    if (!Object.keys(node.metadata).length) {
      return nodeLabel;
    }

    nodeLabel += `\n\n${JSON.stringify(node.metadata).replace(/\"/g, '')}`;

    return nodeLabel;
  };

  return [
    `  "${parent.referenceId}" [label="${getNodeLabel(parent)}"]`,
    `  "${child.referenceId}" [label="${getNodeLabel(child)}"]`,
    `  "${parent.referenceId}" -> "${child.referenceId}" [label="${label}", color="${color}"]`,
  ];
}

/**
 * Generates a DOT file graph markup representation of our underwriting engine
 *
 * @param {AdvanceApprovalEngineNodeJSON[]} nodes
 * @param {AdvanceApprovalEngineEdgeJSON[]} edges
 * @returns {string}
 */
export function generateAdvanceApprovalEngineDOTFromJSON({
  nodes,
  edges,
}: AdvanceApprovalEngineJSON): string {
  const dotEdges = flatMap(edges, edge => {
    const sourceNode = nodes.find(({ referenceId }) => referenceId === edge.source);
    const targetNode = nodes.find(({ referenceId }) => referenceId === edge.target);

    return generateDOTEdge(
      sourceNode,
      targetNode,
      edge.name,
      edge.name === 'success' ? 'green' : 'red',
    );
  });

  return ['digraph approval {', ...dotEdges, '}'].join('\n');
}
