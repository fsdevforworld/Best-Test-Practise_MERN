import * as Bluebird from 'bluebird';
import { merge } from 'lodash';
import { Op } from 'sequelize';

import {
  AdvanceApprovalResult,
  ApprovalDict,
  DecisionCase,
  DecisionCaseError,
  DecisionNodeType,
  IDecisionCaseResponse,
  NodeRuleDescriptionInfo,
} from '../../types';
import { generateRandomHexString, isDevEnv } from '../../../../lib/utils';
import { AdvanceExperimentLog, AdvanceNodeLog, AdvanceRuleLog } from '../../../../models';
import { dogstatsd } from '../../../../lib/datadog-statsd';
import { getFormattedCaseName } from '../index';
import logger from '../../../../lib/logger';
import { getAdvanceExperiments } from '../experiments/update-experiments';

export abstract class DecisionNode {
  // These fields are only used to differentiate between nodes on a graph
  // Not meant to be saved to the DB
  public referenceId: string = generateRandomHexString(4);
  public metadata: { [key: string]: any } = {};
  public isExperimental: boolean = false;
  public abstract cases: Array<DecisionCase<AdvanceApprovalResult>>;
  public onSuccessNode: DecisionNode = null;
  public onFailureNode: DecisionNode = null;
  public getNodeRuleDescriptionInfo: (
    approvalDict?: ApprovalDict,
  ) => NodeRuleDescriptionInfo[] = null;
  public abstract name: string;
  public abstract type: DecisionNodeType;
  private debug: boolean = isDevEnv();

  /**
   * Sets the debug variable for this node and for all child nodes.
   * @param {boolean} debug
   */
  public setDebug(debug: boolean) {
    this.debug = debug;
    if (this.onSuccessNode) {
      this.onSuccessNode.setDebug(debug);
    }
    if (this.onFailureNode) {
      this.onFailureNode.setDebug(debug);
    }
  }

  /**
   * This is the main function which runs all cases and all nodes down the tree.
   * This will evaluate all cases of this node and then if all nodes pass call evaluate on the
   * onSuccessNode or, if an exception is thrown, will call evaluate on the onFailureNode
   * @param {ApprovalDict} dict
   * @param {AdvanceApprovalResult} input
   * @param {Partial<AdvanceApprovalResult>} prevUpdates
   * @returns {Promise<AdvanceApprovalResult>}
   */
  public async evaluate(
    dict: ApprovalDict,
    input: AdvanceApprovalResult = null,
    previousNodeUpdates: Partial<AdvanceApprovalResult> = {},
  ): Promise<AdvanceApprovalResult> {
    // will stop on the first failure
    this.log(`Running ${this.name}...`);
    const { result, errors, updates } = await this.evaluateCases(dict, input, previousNodeUpdates);
    const { caseResolutionStatus } = result;

    if (errors.length === 0) {
      const response: AdvanceApprovalResult = await this.afterAllCases(dict, result);
      this.log(`Succeeded!`);
      if (dict.auditLog) {
        await this.logNodeResults({
          success: true,
          advanceApprovalId: dict.approvalId,
          updates,
        });
      }
      if (this.onSuccessNode) {
        return this.onSuccessNode.evaluate(dict, { ...response, caseResolutionStatus }, updates);
      } else {
        const { updates: onFinishedUpdates = {} } = await this.onFinished({
          approvalDict: dict,
          result: response,
        });
        return { ...response, ...onFinishedUpdates, caseResolutionStatus };
      }
    } else {
      this.log(`Failed with error: ${errors[0].message}`);
      const response = await this.onError(errors, dict, result);
      if (dict.auditLog) {
        await this.logNodeResults({
          success: false,
          advanceApprovalId: dict.approvalId,
          updates,
        });
      }
      if (this.onFailureNode) {
        return this.onFailureNode.evaluate(dict, { ...response, caseResolutionStatus }, updates);
      } else {
        const { updates: onFinishedUpdates = {} } = await this.onFinished({
          approvalDict: dict,
          result: response,
        });
        return { ...response, ...onFinishedUpdates, caseResolutionStatus };
      }
    }
  }

  public async evaluateCases(
    dict: ApprovalDict,
    input: AdvanceApprovalResult,
    previousNodeUpdates: Partial<AdvanceApprovalResult> = {},
  ): Promise<{
    result: AdvanceApprovalResult;
    errors: DecisionCaseError[];
    updates: Partial<AdvanceApprovalResult>;
  }> {
    // Loop through cases with each case waiting for the previous one
    return this.cases.reduce((acc, decisionCase) => {
      return acc.then(
        async ({ result: prevAdvanceApprovalResult, errors, updates: cumulativeUpdates }) => {
          const caseAdvanceApprovalResult =
            (await decisionCase(dict, prevAdvanceApprovalResult, previousNodeUpdates)) || {};
          const { updates = {}, error } = caseAdvanceApprovalResult;
          const name = getFormattedCaseName(decisionCase);
          await this.logDecisionCase(name, dict, caseAdvanceApprovalResult);

          const newAdvanceApprovalResult: AdvanceApprovalResult = merge(
            {},
            prevAdvanceApprovalResult,
            updates,
          );

          cumulativeUpdates = merge({}, cumulativeUpdates, updates);

          newAdvanceApprovalResult.caseResolutionStatus[name] = !error;

          if (error) {
            errors.push(error);
          }

          return { result: newAdvanceApprovalResult, errors, updates: cumulativeUpdates };
        },
      );
    }, Promise.resolve({ result: input, errors: [], updates: {} }));
  }

  public async logDecisionCase(
    caseName: string,
    dict: ApprovalDict,
    response: IDecisionCaseResponse<AdvanceApprovalResult>,
  ) {
    const { error, logData } = response;
    if (dict.auditLog) {
      await AdvanceRuleLog.create({
        advanceApprovalId: dict.approvalId,
        nodeName: this.name,
        ruleName: caseName,
        success: !error,
        data: logData,
        error: error && error.type,
      });
    }
    dogstatsd.increment(`approval_events.decision_case_completed`, {
      status: error ? 'failure' : 'success',
      error_type: error && error.type,
      node_name: this.name,
      decision_case: caseName,
    });
  }

  /**
   * Sets the next node to be called if all of the cases in this node pass successfully.
   *
   * @param node
   * @returns {DecisionNode}
   */
  public onSuccess(node: DecisionNode): DecisionNode {
    this.onSuccessNode = node;
    return this.onSuccessNode;
  }

  /**
   * Sets the next node to be called if any of the cases in this node throw an exception.
   *
   * @param node
   * @returns {DecisionNode}
   */
  public onFailure(node: DecisionNode): DecisionNode {
    this.onFailureNode = node;
    return this.onFailureNode;
  }

  /**
   * Saves the results of this node to the advance_node_log tables
   *
   * @param {boolean} success
   * @param {number} advanceApprovalId
   * @param {AdvanceApprovalResult} approvalResponse
   * @returns {Promise<void>}
   */
  protected async logNodeResults({
    success,
    advanceApprovalId,
    updates,
  }: {
    success: boolean;
    advanceApprovalId: number;
    updates: Partial<AdvanceApprovalResult>;
  }): Promise<void> {
    const approvalResponse = {
      approvalResponseUpdates: updates,
      isMl: this.type === DecisionNodeType.MachineLearning,
      isExperimental: this.isExperimental,
    };
    await AdvanceNodeLog.create({
      name: this.name,
      success,
      advanceApprovalId,
      approvalResponse,
      successNodeName: this.onSuccessNode?.name || null,
      failureNodeName: this.onFailureNode?.name || null,
    });

    dogstatsd.increment(`approval_events.node_completed`, {
      success: success ? '1' : '0',
      node_name: this.name,
    });
  }

  /**
   * This function is meant to re-implemented by child classes. This function is called after all
   * cases have passed and serves to allow the class to make any final modifications to the
   * previous result before the onSuccessNode is called.
   *
   * @param dict
   * @param {AdvanceApprovalResult} previousAdvanceApprovalResult
   * @returns {Promise<AdvanceApprovalResult> | AdvanceApprovalResult}
   */
  protected afterAllCases(
    dict: ApprovalDict,
    previousAdvanceApprovalResult: AdvanceApprovalResult | null,
  ): AdvanceApprovalResult | Promise<AdvanceApprovalResult> {
    return previousAdvanceApprovalResult;
  }

  /**
   * Meant to be extended by child classes. This function default action on error is
   * to just return the previous result. The result of this function will be passed to
   * the onFailure node or returned if no onFailureNode exists.
   *
   * @param {DecisionCaseError[]} errors
   * @param {Dict} dict
   * @param {AdvanceApprovalResult} previousAdvanceApprovalResult
   * @returns {Promise<AdvanceApprovalResult> | AdvanceApprovalResult}
   */
  protected onError(
    errors: DecisionCaseError[],
    dict: ApprovalDict,
    previousAdvanceApprovalResult: AdvanceApprovalResult | null,
  ): AdvanceApprovalResult | Promise<AdvanceApprovalResult> {
    return previousAdvanceApprovalResult;
  }

  /**
   * Called when the engine is finished running
   * Primarily used to determine whether this approval run was experimental
   * Goes through each visited experiment and checks if it was successful based on the provided criteria
   *
   * @param {ApprovalDict} approvalDict
   * @param {AdvanceApprovalResult} result
   * @returns {Promise<Partial<AdvanceApprovalResult>>}
   */
  protected async onFinished({
    approvalDict,
    result,
  }: {
    approvalDict: ApprovalDict;
    result: AdvanceApprovalResult;
  }): Promise<{ updates?: Partial<AdvanceApprovalResult> }> {
    if (!approvalDict.approvalId) {
      return {};
    }

    const experimentNodes = getAdvanceExperiments();
    const experimentLogs = await AdvanceExperimentLog.findAll({
      where: {
        advanceApprovalId: approvalDict.approvalId,
        advanceExperimentId: { [Op.in]: experimentNodes.map(({ id }) => id) },
        success: { [Op.is]: null },
      },
    });

    const results = await Bluebird.map(
      experimentLogs,
      async experimentLog => {
        const experimentNode = experimentNodes.find(
          ({ id }) => id === experimentLog.advanceExperimentId,
        );

        return experimentNode.onEngineFinished({ experimentLog, approvalDict, result });
      },
      { concurrency: 5 },
    );

    return {
      updates: {
        isExperimental: results.some(({ isExperimental }) => isExperimental),
      },
    };
  }

  private log(message: string) {
    if (this.debug) {
      logger.info(message);
    }
  }
}

/**
 * Searches DecisionNode tree for nodes with `name`.
 */
export function findByName(node: DecisionNode, name: string): DecisionNode[] {
  const output: DecisionNode[] = [];
  if (node.name === name) {
    output.push(node);
  }
  const childNodes = [];
  if (node.onSuccessNode) {
    childNodes.push(...findByName(node.onSuccessNode, name));
  }
  if (node.onFailureNode) {
    childNodes.push(...findByName(node.onFailureNode, name));
  }

  childNodes.forEach(child => {
    if (output.indexOf(child) < 0) {
      output.push(child);
    }
  });

  return output;
}
