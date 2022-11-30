import * as PromiseRouter from 'express-promise-router';
import { Router } from 'express';
import logger from '../../../src/lib/logger';
import { MinimalRequest, generateController } from '@dave-inc/google-cloud-tasks-helpers';
import { dogstatsd } from '../../lib/datadog-statsd';

import {
  broadcastAdvanceApproval,
  broadcastAdvanceDisbursement,
  broadcastAdvancePayment,
  broadcastAdvanceTipChanged,
  broadcastPaymentChanged,
  broadcastBankDisconnect,
  collectAfterBankAccountUpdate,
  collectAfterBankAccountUpdateScheduled,
  collectPastDueSubscription,
  matchDisbursementBankTransaction,
  performACHCollection,
  performFraudCheck,
  performPredictedPaycheckCollection,
  refreshSanctionsScreening,
  setSubscriptionDueDate,
  sideHustleNotifications,
  stitchOldAccountTransactions,
  subscriptionCollectionPredictedPayday,
  updateBraze,
  updatePendingSubscriptionPayment,
  updateReimbursementStatus,
  updateSynapsePayUser,
  updateDisbursementStatus,
  updatePaymentStatus,
  processBankConnectionRefresh,
  initiateBankConnectionRefresh,
  completeBankConnectionRefresh,
  processDashboardBulkUpdate,
} from '../../jobs/handlers';

import { updateExpectedTransactions } from '../../domain/recurring-transaction';

const router: Router = PromiseRouter();

function addEndpoint<TPayload, TPromise>(
  target: string,
  handler: (payload: TPayload, req?: MinimalRequest<TPayload>) => Promise<TPromise>,
  options?: {
    suppressErrors?: boolean;
    logPayload?: boolean;
  },
): void {
  const { suppressErrors = false, logPayload } = options || {};
  router.post(target, async (req, res) => {
    const handlerWithContext = async (payload: TPayload): Promise<TPromise> => {
      try {
        return await handler(payload, req);
      } catch (error) {
        // use our own logger for the scrubbed stack trace
        logger.error(`Full task error in ${target}`, { error });

        // the task library logs to console.error before handling a response
        // but it dumps the full exception
        // but it doesn't scrub anything, so we propagate a simple string
        // after logging on our own
        throw new Error(`See other logs for details`);
      }
    };

    generateController(handlerWithContext, dogstatsd, { suppressErrors, logPayload })(req, res);
  });
}

addEndpoint('/broadcastAdvanceApproval', broadcastAdvanceApproval);
addEndpoint('/broadcastAdvanceDisbursement', broadcastAdvanceDisbursement);
addEndpoint('/broadcastAdvancePayment', broadcastAdvancePayment);
addEndpoint('/broadcastAdvanceTipChanged', broadcastAdvanceTipChanged);
addEndpoint('/broadcastPaymentChanged', broadcastPaymentChanged);
addEndpoint('/broadcastBankDisconnect', broadcastBankDisconnect, { suppressErrors: false });
addEndpoint('/collectAfterBankAccountUpdate', collectAfterBankAccountUpdate);
addEndpoint('/collectAfterBankAccountUpdateScheduled', collectAfterBankAccountUpdateScheduled);
addEndpoint('/collectPastDueSubscription', collectPastDueSubscription);
addEndpoint('/completeBankConnectionRefresh', completeBankConnectionRefresh);
addEndpoint('/initiateBankConnectionRefresh', initiateBankConnectionRefresh);
addEndpoint('/matchDisbursementBankTransaction', matchDisbursementBankTransaction);
addEndpoint('/performACHCollection', performACHCollection);
addEndpoint('/performFraudCheck', performFraudCheck);
addEndpoint('/performPredictedPaycheckCollection', performPredictedPaycheckCollection);
addEndpoint('/processBankConnectionRefresh', processBankConnectionRefresh);
addEndpoint('/refreshSanctionsScreening', refreshSanctionsScreening);
addEndpoint('/setSubscriptionDueDate', setSubscriptionDueDate);
addEndpoint('/sideHustleNotifications', sideHustleNotifications);
addEndpoint('/stitchOldAccountTransactions', stitchOldAccountTransactions);
addEndpoint('/subscriptionCollectionPredictedPayday', subscriptionCollectionPredictedPayday);
addEndpoint('/updateBraze', updateBraze);
addEndpoint('/updateExpectedTransactions', updateExpectedTransactions);
addEndpoint('/updatePaymentStatus', updatePaymentStatus);
addEndpoint('/updatePendingSubscriptionPayment', updatePendingSubscriptionPayment, {
  logPayload: true,
});
addEndpoint('/updateReimbursementStatus', updateReimbursementStatus);
addEndpoint('/updateSynapsePayUser', updateSynapsePayUser);
addEndpoint('/updateDisbursementStatus', updateDisbursementStatus);
addEndpoint('/processDashboardBulkUpdate', processDashboardBulkUpdate);

export { addEndpoint };
export default router;
