import { Moment } from 'moment';

export enum ExecutionStatus {
  Success,
  FailureDoNotRetry,
  FailureCanRetry,
}

export type Failure = {
  // POC -- currently unused -- idea is to aggregate failures later (instead of error handling)
  message: string;
  data?: { [key: string]: any };
};

export type SuccessfulExecution = {
  status: ExecutionStatus.Success;
};

export type FailedCanRetryExecution = {
  status: ExecutionStatus.FailureCanRetry;
  failures?: Failure[];
  retryOnOrAfter?: Moment;
  retryLimit?: number;
};

export type FailedDoNotRetryExecution = {
  status: ExecutionStatus.FailureDoNotRetry;
  failures?: Failure[];
};

export type ExecutionResult =
  | SuccessfulExecution
  | FailedCanRetryExecution
  | FailedDoNotRetryExecution
  | void;
