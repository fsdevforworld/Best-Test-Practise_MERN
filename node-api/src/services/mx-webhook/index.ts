import '0-dd-trace-init-first-datadog-enabled';

import * as bodyParser from 'body-parser';
import * as config from 'config';
import { Express } from 'express';
import 'source-map-support/register';

import DaveExpressApp from '../../api/dave-express-app';
import mxRouter from './router';

function configureEndpoints(app: Express) {
  app.use(bodyParser.json());
  app.use(bodyParser.urlencoded({ extended: false }));
  app.use('/services/mx_webhook/v1', mxRouter);
}

export default DaveExpressApp(
  configureEndpoints,
  'mxWebhook',
  config.get<number>('mxAtrium.servicePort'),
);
