import { AdvanceApprovalResult, ApprovalDict } from '../../types';

export interface ILimiter<Result = AdvanceApprovalResult> {
  experimentIsAllowed(dict: ApprovalDict, result: Result): Promise<boolean>;
}
