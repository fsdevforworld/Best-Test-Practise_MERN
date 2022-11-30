import loomisClient, { PaymentMethod as LoomisPaymentMethod } from '@dave-inc/loomis-client';
import logger from '../../lib/logger';
import { InvalidParametersError } from '@dave-inc/error-types';
import { wrapMetrics } from '../../lib/datadog-statsd';

export type GetBankAccountParams = {
  userId: number;
  bankAccountId: number;
};

enum Metric {
  LOOMIS_ERROR = 'advance_approval.loomis_error',
}

export const metrics = wrapMetrics<Metric>();

export async function getBankPaymentMethod(
  params: GetBankAccountParams,
): Promise<LoomisPaymentMethod> {
  if (!params.userId || !params.bankAccountId) {
    throw new InvalidParametersError('UserId and bankAccountId are required');
  }

  const includeBankAccounts = true;
  const loomisResponse = await loomisClient.getPaymentMethods(params.userId, {
    includeBankAccounts,
  });

  if ('error' in loomisResponse) {
    logger.error('Error fetching bank payment method from Loomis', {
      params,
      error: loomisResponse.error,
      logSource: __filename,
    });
    metrics.increment(Metric.LOOMIS_ERROR);
    throw loomisResponse.error;
  }
  return loomisResponse.data.find(account => account.bankAccountId === params.bankAccountId);
}
