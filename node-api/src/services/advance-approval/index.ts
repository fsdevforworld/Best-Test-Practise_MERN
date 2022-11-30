import '0-dd-trace-init-first-datadog-enabled';

import { Express } from 'express';
import * as config from 'config';
// Set up source map support for stack traces
import 'source-map-support/register';
// Services
import { advanceApprovalRouter } from './router';
import DaveExpressApp from '../../api/dave-express-app';
import * as bodyParser from 'body-parser';

export const CreateApprovalPath = '/services/advance-approval/approval';
export const GetPreQualifyPath = '/services/advance-approval/pre-qualify';
export const GetApprovalPath = '/services/advance-approval/approval';
export const GetApprovalByIdPath = (id: number) => `/services/advance-approval/approval/${id}`;
export const GetRulesPath = '/services/advance-approval/rules';
export const GetAdvanceSummaryPath = '/services/advance-approval/advance-summary';

function configureEndpoints(app: Express) {
  app.use(bodyParser.json());
  app.use(bodyParser.urlencoded({ extended: false }));
  app.use('/services/advance-approval', advanceApprovalRouter);
}

export default DaveExpressApp(
  configureEndpoints,
  config.get<string>('advanceApproval.serviceName'),
  config.get<number>('advanceApproval.servicePort'),
);
