import { last, sortBy, isNil } from 'lodash';
import { TaskInterleaved, Result } from '@dave-inc/tivan-client';
import { DashboardAdvanceRepayment } from '../../../../models';
import { dogstatsd } from '../../../../lib/datadog-statsd';

type RepaymentStatus = DashboardAdvanceRepayment['status'];

function extractStatusFromTask(task: TaskInterleaved): RepaymentStatus {
  const latestAttempt = last(sortBy(task.taskAttempts, 'created'));
  if (isNil(latestAttempt)) {
    return 'PENDING';
  }

  const latestResult = last(sortBy(latestAttempt.taskAttemptResults, 'created'));
  if (isNil(latestResult)) {
    return 'PENDING';
  }

  const { result } = latestResult;

  switch (result) {
    case Result.Success:
      return 'SUCCEEDED';
    case Result.Failure:
    case Result.Error:
      return 'FAILED';
    case Result.Pending:
      return 'PENDING';
    default:
      dogstatsd.event('Unexpected result from Tivan', result, { alert_type: 'warning' });
      return 'PENDING';
  }
}

export default extractStatusFromTask;
