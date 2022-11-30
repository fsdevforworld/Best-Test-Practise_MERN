import '0-dd-trace-init-first-datadog-enabled';

import { Express } from 'express';
import * as config from 'config';
// Set up source map support for stack traces
import 'source-map-support/register';
// Services
import { recurringTransactionRouter } from './router';
import DaveExpressApp from '../../api/dave-express-app';
import * as bodyParser from 'body-parser';

function configureEndpoints(app: Express) {
  app.use(bodyParser.json());
  app.use(bodyParser.urlencoded({ extended: false }));
  app.use('/services/recurring-transaction', recurringTransactionRouter);
}

export default DaveExpressApp(
  configureEndpoints,
  config.get<string>('recurringTransaction.serviceName'),
  config.get<number>('recurringTransaction.servicePort'),
);
