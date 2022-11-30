import { isNil, pick } from 'lodash';
import { runTaskGracefully } from '../../src/lib/utils';
import getBackfiller from '../../src/lib/backfill/backfill-sequelize-data';
import { PaymentMethod } from '../../src/models';
import { FindOptions, Op } from 'sequelize';
import { paymentMethodBackfillEvent } from '../../src/domain/event';

const MIN_ID = isNil(process.env.END_ID) ? 0 : parseInt(process.env.END_ID, 10);
const START_ID = isNil(process.env.START_ID) ? null : parseInt(process.env.START_ID, 10);
const JOB_ID = process.env.BACKFILL_JOB_ID ?? 'default';
const REDIS_KEY =
  JOB_ID !== 'default'
    ? `backfill_payment_method_max_id_${JOB_ID}`
    : 'backfill_payment_method_max_id';
const CONCURRENCY = !isNil(process.env.CONCURRENCY) ? parseInt(process.env.CONCURRENCY, 10) : 1000;
const BACKFILL_DELETED = process.env.BACKFILL_DELETED === 'true';

async function queryFn(options: FindOptions): Promise<PaymentMethod[]> {
  if (BACKFILL_DELETED) {
    options.where = { deleted: { [Op.not]: null }, ...options.where };
    options.paranoid = false;
    return PaymentMethod.unscoped().findAll(options);
  } else {
    return PaymentMethod.unscoped().findAll(options);
  }
}

async function publishFn(data: PaymentMethod): Promise<void> {
  const message = {
    legacyId: data.id,
    expiration: data.expiration.format('YYYY-MM-DD'),
    deleted: data.deleted?.valueOf() ?? null,
    invalid: data.invalid?.valueOf() ?? null,
    ...pick(data, [
      'availability',
      'userId',
      'bankAccountId',
      'mask',
      'displayName',
      'scheme',
      'tabapayId',
      'zipCode',
      'optedIntoDaveRewards',
      'bin',
      'invalidReasonCode',
    ]),
  };
  await paymentMethodBackfillEvent.publish(message);
}

const backfiller = getBackfiller<PaymentMethod>({
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
