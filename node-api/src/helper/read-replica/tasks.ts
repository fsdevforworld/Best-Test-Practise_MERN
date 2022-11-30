import { isNil } from 'lodash';
import { define } from '@dave-inc/error-types';
import {
  MinimalRequest as TaskRequest,
  getCreationTime,
} from '@dave-inc/google-cloud-tasks-helpers';
import { getReadReplicaLag } from './get-lag';

function getTaskLag(taskCreatedDate: Date | undefined): number | undefined {
  return isNil(taskCreatedDate)
    ? undefined
    : (new Date().getTime() - taskCreatedDate.getTime()) / 1000;
}

function getDbVsTaskLagDelta(
  dbLag: number | undefined,
  taskLag: number | undefined,
): number | undefined {
  if (!isNil(dbLag) && !isNil(taskLag)) {
    return dbLag - taskLag;
  }
}

export const TaskTooEarlyError = define('TaskTooEarly', 425);

export async function shouldTaskUseReadReplica(
  req: TaskRequest<any>,
  maxLagSec: number,
): Promise<boolean> {
  const dbLag = await getReadReplicaLag();
  const taskCreated = getCreationTime(req);
  const taskLag = getTaskLag(taskCreated);
  return shouldUseReadReplica(dbLag, taskLag, maxLagSec);
}

export async function shouldUseReadReplica(
  dbLag: number,
  taskLag: number,
  maxLagSec: number,
): Promise<boolean> {
  const dbLagFromTask = getDbVsTaskLagDelta(dbLag, taskLag);
  if (isNil(dbLagFromTask) || dbLagFromTask > maxLagSec) {
    return false;
  } else if (dbLagFromTask <= 0) {
    return true;
  } else {
    throw new TaskTooEarlyError('Task ahead of read replica', {
      data: {
        replicaLag: dbLag,
        taskLag,
      },
    });
  }
}
