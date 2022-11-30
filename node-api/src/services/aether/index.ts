import '0-dd-trace-init-first-datadog-enabled';

import * as bodyParser from 'body-parser';
import * as config from 'config';
import { Express } from 'express';
import 'source-map-support/register';

import DaveExpressApp from '../../api/dave-express-app';

import aetherRouter from './router';

export const BASE_SERVICE_PATH = '/services/aether/v1';

function configureEndpoints(app: Express) {
  app.use(bodyParser.json());
  app.use(BASE_SERVICE_PATH, aetherRouter);
}

export default DaveExpressApp(
  configureEndpoints,
  'aether',
  config.get<number>('aether.servicePort'),
);
