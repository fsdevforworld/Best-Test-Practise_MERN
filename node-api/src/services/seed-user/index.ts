import { Express } from 'express';
import * as bodyParser from 'body-parser';
import * as config from 'config';
import DaveExpressApp from '../../api/dave-express-app';
import seedUserRouter from './router';

export const BASE_SERVICE_PATH = '/services/seed-user/v1';

function configureEndpoints(app: Express) {
  app.use(bodyParser.json());
  app.use(BASE_SERVICE_PATH, seedUserRouter);
}

export default DaveExpressApp(
  configureEndpoints,
  'seedUser',
  config.get<number>('seedUser.servicePort'),
);
