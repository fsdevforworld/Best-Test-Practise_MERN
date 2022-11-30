import { delay } from 'bluebird';
import { flatMap, isNil, last, sortBy } from 'lodash';
import { InvalidParametersError } from '@dave-inc/error-types';
import { IOptions } from '@dave-inc/google-cloud-tasks-helpers';
import { encodePaymentMethodId, PaymentMethodId } from '@dave-inc/loomis-client';
import { moment, Moment } from '@dave-inc/time-lib';
import logger from '../../lib/logger';
import {
  AdvanceRequest,
  IAdvance,
  IAdvanceWithPayment,
  TivanPaymentStatus,
  TivanProcess,
  TivanResult,
  TaskInterleaved,
  TaskPaymentResult,
  getTivanClient,
} from '../../lib/tivan-client';
import { Advance } from '../../models';
import { Metrics, metrics } from './metrics';
import { AdvanceCollectionTrigger } from '../../typings';

export function createTaskId(
  advanceId: number,
  source: string,
  createTime: Moment = moment(),
): string {
  return `tivan-${source}_advance-id_${advanceId}-${createTime.unix()}`;
}

export function getTivanProcessForTrigger(trigger: AdvanceCollectionTrigger): IAdvance['process'] {
  // TODO: Chen has changed this function in his PR. We need to handle the blind collection processes
  switch (trigger) {
    case AdvanceCollectionTrigger.BANK_ACCOUNT_UPDATE:
      return TivanProcess.AdvanceUseCurrentBalance;
    default:
      return TivanProcess.Advance;
  }
}

export async function createAdvanceRepaymentTask(
  advance: Advance,
  trigger: AdvanceCollectionTrigger,
  options: IOptions = {},
): Promise<string> {
  const advanceTask = {
    userId: advance.userId,
    advanceId: advance.id,
    process: getTivanProcessForTrigger(trigger),
    source: trigger,
  };

  return createRepaymentTask(advanceTask, options);
}

function getTivanProcessForManualTrigger(
  trigger: AdvanceCollectionTrigger,
): IAdvanceWithPayment['process'] {
  switch (trigger) {
    case AdvanceCollectionTrigger.USER:
    case AdvanceCollectionTrigger.ADMIN:
    case AdvanceCollectionTrigger.ADMIN_MANUAL_CREATION:
      return TivanProcess.AdvanceWithPayment;
    // todo: support these
    case AdvanceCollectionTrigger.USER_ONE_TIME_CARD:
    case AdvanceCollectionTrigger.USER_WEB:
    default:
      throw new InvalidParametersError('Unsupported trigger for Tivan user payments', {
        data: {
          trigger,
        },
      });
  }
}

export function isManualPaymentTrigger(trigger: AdvanceCollectionTrigger): boolean {
  return [
    AdvanceCollectionTrigger.ADMIN,
    AdvanceCollectionTrigger.ADMIN_MANUAL_CREATION,
    AdvanceCollectionTrigger.USER,
    AdvanceCollectionTrigger.USER_ONE_TIME_CARD,
    AdvanceCollectionTrigger.USER_WEB,
  ].includes(trigger);
}

export async function createUserPaymentTask(
  advance: Advance,
  trigger: AdvanceCollectionTrigger,
  paymentMethodId: PaymentMethodId,
  amount: number,
  options: IOptions = {},
): Promise<string> {
  const advanceTask = {
    userId: advance.userId,
    advanceId: advance.id,
    process: getTivanProcessForManualTrigger(trigger),
    source: trigger,
    payment: {
      paymentMethodId: encodePaymentMethodId(paymentMethodId),
      amount,
    },
  };

  return createRepaymentTask(advanceTask, options);
}

async function createRepaymentTask(
  taskData: AdvanceRequest,
  options: IOptions = {},
): Promise<string> {
  if (isNil(options.taskId)) {
    options = {
      taskId: createTaskId(taskData.advanceId, taskData.source),
      ...options,
    };
  }
  const metricTags = {
    process: TivanProcess[taskData.process],
    source: taskData.source,
  };

  const taskId = options.taskId;
  try {
    if (isManualPaymentTrigger(taskData.source as AdvanceCollectionTrigger)) {
      await getTivanClient().enqueueApiTask(taskData, options);
    } else {
      await getTivanClient().enqueueTask(taskData, options);
    }
    metrics.increment(Metrics.TaskCreated, metricTags);

    return taskId;
  } catch (error) {
    metrics.increment(Metrics.TaskError, metricTags);
    logger.error('Error enqueueing Tivan task', {
      error,
      taskId,
      taskData,
    });
  }
}

export type TaskStatus = {
  result: TivanResult;
  // if result is Success, payments is a list of successful payments.
  // for now a task can only have one success, but in the future we
  // may do partial collections from multiple sources
  successfulPayments: TaskPaymentResult[];
};

// Payments are considered successful if the status is Success
// or Pending.
function extractSuccessfulPayments(task: TaskInterleaved): TaskPaymentResult[] {
  return flatMap(task.taskPaymentMethods, paymentMethod =>
    paymentMethod.taskPaymentResults.filter(
      payment =>
        payment.result === TivanPaymentStatus.Success ||
        payment.result === TivanPaymentStatus.Pending,
    ),
  );
}

export async function getTask(taskId: string): Promise<TaskInterleaved> {
  return await getTivanClient().task(taskId);
}

export async function getTaskStatus(taskId: string): Promise<TaskStatus | null> {
  const task = await getTask(taskId);
  const latestAttempt = last(sortBy(task.taskAttempts, 'created'));
  if (!isNil(latestAttempt)) {
    const latestResult = last(sortBy(latestAttempt.taskAttemptResults, 'created'));
    if (!isNil(latestResult)) {
      return {
        result: latestResult.result,
        successfulPayments: extractSuccessfulPayments(task),
      };
    }
  }
}

/*
 * Tivan tasks are enqueued and executed asynchronously. This function will
 * wait for at least one completed task attempt, and return the result of
 * the latest attempt
 *
 * If no results are detected before the timeout, a Pending is returned.
 */
export async function waitForTaskResult(
  taskId: string,
  timeoutSec: number = 30,
  pollIntervalSec: number = 0.5,
): Promise<TaskStatus | undefined> {
  const timeoutMsec = timeoutSec * 1000;
  const pollIntervalMsec = pollIntervalSec * 1000;
  const start = Date.now();
  let end = Date.now();

  while (end - start < timeoutMsec) {
    try {
      const status = await getTaskStatus(taskId);
      if (!isNil(status)) {
        metrics.increment(Metrics.TaskWaitComplete, { result: TivanResult[status.result] });
        return status;
      }

      end = Date.now();
    } catch (err) {
      if (err && err.status === 404) {
        // due to task queue delays, the task may not be
        // immediately created
        await delay(pollIntervalMsec);
        end = Date.now();
      } else {
        throw err;
      }
    }
    if (end + pollIntervalMsec - start < timeoutMsec) {
      await delay(pollIntervalMsec);
      end = Date.now();
    } else {
      break;
    }
  }

  metrics.increment(Metrics.TaskWaitTimeout);
}
