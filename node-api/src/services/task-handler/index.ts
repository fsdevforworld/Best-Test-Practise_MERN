import '0-dd-trace-init-first-datadog-enabled';

import { createMiddlewareFromEmail } from '@dave-inc/google-cloud-tasks-helpers';

import DaveExpressApp from '../../api/dave-express-app';

import * as bodyParser from 'body-parser';
import * as config from 'config';
import * as express from 'express';
import TaskHandlerRouter from './router';

// Set up source map support for stack traces
import 'source-map-support/register';

const GOOGLE_TASKS_SERVICE_ACCOUNT = config.get('googleCloud.tasks.signingEmail') as string;

function configureEndpoints(app: express.Express) {
  app.use(bodyParser.json());
  app.use(bodyParser.urlencoded({ extended: false }));

  app.use('/', createMiddlewareFromEmail(GOOGLE_TASKS_SERVICE_ACCOUNT), TaskHandlerRouter);
}

export default DaveExpressApp(configureEndpoints, 'node-api', 7452);
