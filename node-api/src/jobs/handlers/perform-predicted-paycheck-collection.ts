import loomisClient from '@dave-inc/loomis-client';
import { AdvanceCollectionTrigger } from '../../typings';
import { dogstatsd } from '../../lib/datadog-statsd';
import { moment } from '@dave-inc/time-lib';
import { Advance, BankAccount } from '../../models';
import * as Collection from '../../domain/collection';
import * as RecurringTransactionDomain from '../../domain/recurring-transaction';
import { PredictedPaycheckCollectionData } from '../data';
import { parseLoomisGetPaymentMethod } from '../../services/loomis-api/helper';

const TRIGGER_NAME: AdvanceCollectionTrigger = AdvanceCollectionTrigger.PREDICTED_PAYDAY;

const DATADOG_EVENT = 'advance_collection.predicted_paycheck';

function logEvent(exitStatus: string) {
  dogstatsd.increment(DATADOG_EVENT, { exit_status: exitStatus });
}

export async function performPredictedPaycheckCollection(
  data: PredictedPaycheckCollectionData,
): Promise<void> {
  const { advanceId, recurringTransactionId } = data;

  await dogstatsd.increment(`${DATADOG_EVENT}.job_started`);

  const advance = await Advance.findOne({
    where: { id: advanceId },
    include: [BankAccount],
  });
  const loomisResponse = await loomisClient.getPaymentMethod({ id: advance.paymentMethodId });
  const paymentMethod = parseLoomisGetPaymentMethod(loomisResponse, __filename);

  if (!paymentMethod || paymentMethod.invalid) {
    logEvent('invalid_payment_method');
    return;
  }

  const recurringIncome = await RecurringTransactionDomain.getById(recurringTransactionId);

  if (!recurringIncome) {
    logEvent('recurring_income_not_found');
    return;
  }

  const nextPayday = recurringIncome.rsched.after(moment().startOf('day'), true);

  if (!nextPayday.isSame(moment(), 'day')) {
    logEvent('paycheck_not_today');
    return;
  }

  const charge = Collection.createDebitCardAdvanceCharge(paymentMethod, advance);

  await Collection.collectAdvance(advance, advance.outstanding, charge, TRIGGER_NAME);

  logEvent('collection_attempted');
}
