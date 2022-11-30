import '0-dd-trace-init-first-datadog-enabled';

import * as express from 'express';
import * as config from 'config';
// Set up source map support for stack traces
import 'source-map-support/register';
// Services
import { authRouter } from './user-auth';
import DaveExpressApp from '../api/dave-express-app';

const activeServices: string[] = [];

const services = config.get<any>('services');
Object.keys(services).map(key => {
  activeServices.push(key);
});

function configureEndpoints(app: express.Express) {
  if (activeServices.includes('auth')) {
    app.use('/services/v1/auth', authRouter);
  }
}

export default DaveExpressApp(configureEndpoints, 'userAuth', services.port);
