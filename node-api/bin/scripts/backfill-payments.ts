import { PaymentProviderTransactionType } from '@dave-inc/loomis-client';
import { ExternalTransactionProcessor } from '@dave-inc/wire-typings';
import { isNil, pick } from 'lodash';
import { runTaskGracefully } from '../../src/lib/utils';
import getBackfiller from '../../src/lib/backfill/backfill-sequelize-data';
import { Payment } from '../../src/models';
import { FindOptions } from 'sequelize';
import { paymentBackfillEvent } from '../../src/domain/event';

const MIN_ID = isNil(process.env.END_ID) ? 0 : parseInt(process.env.END_ID, 10);
const START_ID = isNil(process.env.START_ID) ? null : parseInt(process.env.START_ID, 10);
const JOB_ID = process.env.BACKFILL_JOB_ID ?? 'default';
const REDIS_KEY =
  JOB_ID !== 'default' ? `backfill_payment_max_id_${JOB_ID}` : 'backfill_payment_max_id';
const CONCURRENCY = !isNil(process.env.CONCURRENCY) ? parseInt(process.env.CONCURRENCY, 10) : 1000;

async function queryFn(options: FindOptions): Promise<Payment[]> {
  return Payment.unscoped().findAll(options);
}

async function publishFn(data: Payment): Promise<void> {
  if (data.externalProcessor !== ExternalTransactionProcessor.Tabapay) {
    return;
  }

  const payload = {
    legacyId: data.id,
    type: PaymentProviderTransactionType.AdvancePayment,
    owningEntityId: `advance-${data.advanceId}`,
    bankTransactionId: data.bankTransactionUuid,
    ...pick(data, [
      'userId',
      'paymentMethodId',
      'amount',
      'referenceId',
      'externalId',
      'status',
      'externalProcessor',
    ]),
  };
  await paymentBackfillEvent.publish(payload);
}

const backfiller = getBackfiller<Payment>({
  queryFn,
  publishFn,
  minId: MIN_ID,
  startId: START_ID,
  redisKey: REDIS_KEY,
  concurrency: CONCURRENCY,
  metricName: 'node_api.payment_method.published',
  jobName: JOB_ID,
});

runTaskGracefully(backfiller);
