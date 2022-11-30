import '0-dd-trace-init-first-datadog-enabled';
import * as config from 'config';
import * as bodyParser from 'body-parser';
import { Express } from 'express';
import 'source-map-support/register';
import {
  ALL_ADMIN_INTERNAL_ROLES,
  ALL_CUSTOMER_SUPPORT_INTERNAL_ROLES,
} from '../../models/internal-role';
import requireInternalAuth from './middleware/require-internal-auth';
import requireInternalRole from './middleware/require-internal-role';
import setLocale from '../../middleware/set-locale';
import { configureI18NextMiddleware } from '../../api/i18next-config';
import DaveExpressApp from '../../api/dave-express-app';
import supportRouter from './dashboard/router';
import adminRouter from './admin/router';
import v2Router from './v2';

function configureEndpoints(app: Express) {
  app.use(bodyParser.json());
  app.use(bodyParser.urlencoded({ extended: false }));

  configureI18NextMiddleware(app);
  app.use(setLocale);

  app.use(
    '/dashboard',
    requireInternalAuth,
    requireInternalRole(ALL_CUSTOMER_SUPPORT_INTERNAL_ROLES),
    supportRouter,
  );

  app.use(
    '/admin',
    requireInternalAuth,
    requireInternalRole(ALL_ADMIN_INTERNAL_ROLES),
    adminRouter,
  );

  app.use('/v2', requireInternalAuth, v2Router);
}

export default DaveExpressApp(
  configureEndpoints,
  'internalDashboardApi',
  config.get<number>('internalDashboardApi.servicePort'),
);
