import { Op } from 'sequelize';
import { DecisionNode } from './decision-node';
import { ILimiter } from './limiter';
import { dogstatsd } from '../../../../lib/datadog-statsd';
import { IDecisionCaseResponse, ApprovalDict, AdvanceApprovalResult } from '../../types';
import { AdvanceExperiment, AdvanceExperimentLog } from '../../../../models';

enum Metric {
  ExperimentVisited = 'advance_approval.experiment_visited',
  ExperimentResult = 'advance_approval.experiment_result',
}

/**
 * Runs an experiment on a single case.
 *
 * The experiment contains both the normal case and the experiment case.
 * If the limiters allow, then the experiment runs. Otherwise, the
 * default runs.
 *
 * A typical use-case would be to identify an existing case to test,
 * move it into its own ExperimentDecisionNode, and append it to the
 * success condition of its original node.
 */
export default abstract class ExperimentDecisionNode extends DecisionNode {
  public cases = [this.run.bind(this)];

  public isExperimental: boolean = true;

  /**
   * Identifies this as an experiment during node traversal.
   */
  public readonly isExperimentDecisionNode = true;

  /**
   * (Deprecated once we switch to id) Identifies experiment uniquely amongst experiments.
   */
  public abstract name: string;

  /**
   * Identifies experiment uniquely amongst experiments.
   */
  public abstract id: number;

  /**
   * Describes the purpose of this experiment.
   */
  public abstract description: string;

  /**
   * RDetermine whether or not the experiment should run or not.
   */
  protected limiters: Array<ILimiter<AdvanceApprovalResult>> = [];

  /**
   * Checks limiters and previous experiments to see if user is eligible
   * @param dict
   * @param result
   */
  public async isEligibleForExperiment(
    dict: ApprovalDict,
    result: AdvanceApprovalResult,
  ): Promise<boolean> {
    // Let users through who have already seen experiment and successfully received advance
    const userReceivedAdvanceThroughExperiment = Boolean(
      await AdvanceExperimentLog.findOne({
        where: {
          userId: dict.userId,
          advanceId: { [Op.ne]: null },
          advanceExperimentId: this.id,
          bankAccountId: dict.bankAccount.id,
          success: true,
        },
      }),
    );
    if (userReceivedAdvanceThroughExperiment) {
      return true;
    } else {
      // Otherwise determine eligibility by going through limiters
      const limiterResults = await Promise.all(
        this.limiters.map(limiter => limiter.experimentIsAllowed(dict, result)),
      );

      return limiterResults.every(limiterResult => limiterResult === true);
    }
  }

  /**
   * Determines if the advance experiment was successful
   * This flag will be saved in the advance_experiment_log table
   *
   * @param {ApprovalDict} approvalDict
   * @param {AdvanceApprovalResult} result
   * @returns {Promise<boolean>}
   */
  public abstract async isSuccessful({
    approvalDict,
    result,
  }: {
    approvalDict: ApprovalDict;
    result: AdvanceApprovalResult;
  }): Promise<boolean>;

  /**
   * Fires once the engine has finished processing all nodes
   *
   * Used to figure out if this node was successful, and saves this flag to the advance_experiment_log table
   *
   * @param {AdvanceExperimentLog} experimentLog
   * @param {ApprovalDict} approvalDict
   * @param {AdvanceApprovalResult} result
   * @returns {Promise<{ isExperimental: boolean }>}
   */
  public async onEngineFinished({
    experimentLog,
    approvalDict,
    result,
  }: {
    experimentLog: AdvanceExperimentLog;
    approvalDict: ApprovalDict;
    result: AdvanceApprovalResult;
  }): Promise<{ isExperimental: boolean }> {
    const success = await this.isSuccessful({ approvalDict, result });

    // Sequelize doesn't like experimentLog.update(), thinks null values are same as false
    await AdvanceExperimentLog.update({ success }, { where: { id: experimentLog.id } });

    dogstatsd.increment(Metric.ExperimentResult, {
      experiment_name: this.name,
      success: success ? '1' : '0',
    });

    return { isExperimental: success };
  }

  /**
   * Fired once the decision process has resulted in an advance.
   *
   * This hook is the opportunity to record experiment results for both
   * the control and treatment groups.
   */
  public abstract async onAdvanceCreated({
    advanceId,
    experimentLog,
    isFirstAdvanceForExperiment,
  }: {
    advanceId: number;
    experimentLog: AdvanceExperimentLog;
    isFirstAdvanceForExperiment: boolean;
  }): Promise<void>;

  /**
   * Runs every time this experiment is ran, can decide what to do based on the limiter did allow
   * result. And must return ExperimentResult and experimentDidSucceed for logging purposes.
   */
  protected abstract experimentCase(
    dict: ApprovalDict,
    isEligibleForExperiment: boolean,
    result: AdvanceApprovalResult,
  ): Promise<IDecisionCaseResponse<AdvanceApprovalResult>>;

  /**
   * Called as a regular part of the approval engine.
   */
  private async run(
    dict: ApprovalDict,
    result: AdvanceApprovalResult,
  ): Promise<IDecisionCaseResponse<AdvanceApprovalResult>> {
    await AdvanceExperiment.findOrCreate({
      defaults: {
        id: this.id,
        name: this.name,
        description: this.description,
        version: 1,
      },
      where: { id: this.id },
    });

    const isEligibleForExperiment = await this.isEligibleForExperiment(dict, result);

    const caseResponse = (await this.experimentCase(dict, isEligibleForExperiment, result)) || {};
    const { error, updates = {}, logData = {} } = caseResponse;

    if (isEligibleForExperiment && dict.auditLog) {
      dogstatsd.increment(Metric.ExperimentVisited, {
        experiment_name: this.name,
        errored: error ? '1' : '0',
      });

      await AdvanceExperimentLog.create({
        advanceApprovalId: dict.approvalId,
        advanceExperimentId: this.id,
        userId: dict.userId,
        bankAccountId: dict.bankAccount.id,
        extra: caseResponse,
        // fail right away if experiment node fails
        // otherwise null for now, will be set at the end of engine based on the provided criteria
        success: error ? false : null,
      });
    }

    return {
      updates,
      error,
      logData: {
        ...logData,
      },
    };
  }
}
