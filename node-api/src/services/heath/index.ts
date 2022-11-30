import '0-dd-trace-init-first-datadog-enabled';

import { Express, Request, Response, NextFunction } from 'express';
import * as config from 'config';
// Set up source map support for stack traces
import 'source-map-support/register';
// Services
import { bankingDataRouter } from './router';
import DaveExpressApp from '../../api/dave-express-app';
import * as bodyParser from 'body-parser';
import { HeathUnavailableError } from '../../lib/error';
import { ConnectionError as SequelizeConnectionError } from 'sequelize';

function configureEndpoints(app: Express) {
  app.use(bodyParser.json());
  app.use(bodyParser.urlencoded({ extended: false }));
  app.use('/services/banking-data', bankingDataRouter);

  app.use((error: Error, req: Request, _: Response, next: NextFunction) => {
    if (error instanceof SequelizeConnectionError) {
      next(new HeathUnavailableError(error.message));
    } else {
      next(error);
    }
  });
}

export default DaveExpressApp(
  configureEndpoints,
  config.get<string>('heath.serviceName'),
  config.get<number>('heath.servicePort'),
);
