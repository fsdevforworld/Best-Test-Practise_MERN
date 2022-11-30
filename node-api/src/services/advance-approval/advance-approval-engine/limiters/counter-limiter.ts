import { AdvanceApprovalResult, AdvanceApprovalTrigger, ApprovalDict } from '../../types';
import { ILimiter } from '../decision-node/limiter';
import { isNil } from 'lodash';

/**
 * Limits based on a counter function and a limit
 */
export default class CounterLimiter implements ILimiter<AdvanceApprovalResult> {
  constructor(public limit: number, private getCounterValue: () => Promise<number> | number) {
    if (isNil(limit) || isNil(getCounterValue)) {
      throw new Error('Counter must have a non null limit and getCounterValue function.');
    }
  }

  /**
   * @returns {Boolean} True if the count is less than the limit.
   */
  public async experimentIsAllowed(approvalDict: ApprovalDict): Promise<boolean> {
    const trigger = approvalDict.advanceApprovalTrigger;
    if (trigger !== AdvanceApprovalTrigger.UserTerms) {
      return false;
    }

    const currentCount = await Promise.resolve(this.getCounterValue());

    return currentCount < this.limit;
  }
}
