import '0-dd-trace-init-first-datadog-enabled';
import * as profiler from '@google-cloud/profiler';
import * as bodyParser from 'body-parser';
import * as config from 'config';
import * as cookieParser from 'cookie-parser';
import * as express from 'express';
// Set up source map support for stack traces
import 'source-map-support/register';
import authEmpyr from '../middleware/auth-empyr';
import disableCacheMiddleware from '../middleware/disable-cache';
import duplicateRequestMiddleware from '../middleware/duplicate-requests';
import ensureRequestIdExistsMiddleware from '../middleware/ensure-request-id-exists';
import internalAuth from '../middleware/internal-auth';
import setLocale from '../middleware/set-locale';
import { configureI18NextMiddleware } from './i18next-config';
import DaveExpressApp from './dave-express-app';
import internalRouter from './internal';
import redirect from './redirect';
import Router from './v1/router';
import V2Router from './v2/router';
import UserAccountRouter from '../services/user-accounts/router';
import SombraRouter from '../services/sombra/router';
import PromotionRouter from '../services/promotions/router';
import AnalyticsRouter from '../services/analytics/router';

if (process.env.USE_PROFILER) {
  profiler.start({
    serviceContext: {
      service: 'dave-173321',
      version: '1.0.2',
    },
  });
}

function configureEndpoints(app: express.Express) {
  // Middlewares
  app.use(duplicateRequestMiddleware);
  app.use(ensureRequestIdExistsMiddleware);
  app.use(cookieParser(config.get('dave.cookie.secret')));
  // This is a bit hacky, but in order to verify Empyr is calling us we have to compare the signature of the raw data
  // to the signature provided by them using our client secret. In order to get the raw data we use a callback to
  // bodyParser
  app.use(bodyParser.json({ limit: '10mb', verify: authEmpyr }));
  app.use(bodyParser.urlencoded({ extended: false }));
  app.use(disableCacheMiddleware);

  configureI18NextMiddleware(app);
  app.use(setLocale);

  // Routes
  app.use('/v1', Router);
  app.use('/v2', V2Router);
  app.use('/internal', internalAuth, internalRouter);
  app.use('/auth', SombraRouter);
  app.use('/users', UserAccountRouter);
  app.use('/promotions', PromotionRouter);
  app.use('/analytics', AnalyticsRouter);

  app.get('/r', redirect);
}

export default DaveExpressApp(configureEndpoints, 'node-api');
