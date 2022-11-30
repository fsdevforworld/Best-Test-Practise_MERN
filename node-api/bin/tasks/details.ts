/**
 * This file gets the details of all tasks on the queue.
 * It isn't exercised by the service.
 */
import * as config from 'config';

import { CloudTasksClient } from '@google-cloud/tasks';
import { google } from '@google-cloud/tasks/build/protos/protos';
import logger from '../../src/lib/logger';

const PROJECT_ID = config.get('googleCloud.projectId') as string;
const LOCATION = config.get('googleCloud.location') as string;
const QUEUE_NAME = config.get('googleCloud.tasks.queueName') as string;

async function run() {
  const client = new CloudTasksClient({ PROJECT_ID });

  const parent = client.queuePath(PROJECT_ID, LOCATION, QUEUE_NAME);
  const [tasks] = await client.listTasks({ parent });

  for (const task of tasks) {
    const { name } = task;
    // While the Task does have a task.httpRequest.Body property
    // and that property does have a buffer
    // That buffer is always empty unless you request a FULL response view.
    const [detailedTask] = await client.getTask({
      name,
      responseView: google.cloud.tasks.v2.Task.View.FULL,
    });
    logger.info('Task details', { detailedTask });

    const bodyText = detailedTask.httpRequest.body.toString();
    logger.info(`full body: ${bodyText}`);
  }
}

run()
  .then(() => logger.info('finished executing script'))
  .catch(error => logger.error(`Error: ${error} π ${JSON.stringify(error)}`));
