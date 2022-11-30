import * as PromiseRouter from 'express-promise-router';
import { Router } from 'express';

import {
  createApproval,
  getPreQualify,
  getApproval,
  getApprovalById,
  createSingleApproval,
  updateExperiments,
  getRules,
  getAdvanceSummary,
} from './controller';

export const advanceApprovalRouter: Router = PromiseRouter();

advanceApprovalRouter.post('/approval', createApproval);
advanceApprovalRouter.post(
  '/recurring-transaction/:recurringTransactionId/approval',
  createSingleApproval,
);
advanceApprovalRouter.get('/pre-qualify', getPreQualify);
advanceApprovalRouter.get('/approval', getApproval);
advanceApprovalRouter.get('/approval/:approvalId', getApprovalById);
advanceApprovalRouter.put('/experiments', updateExperiments);
advanceApprovalRouter.get('/rules', getRules);
advanceApprovalRouter.get('/advance-summary', getAdvanceSummary);
