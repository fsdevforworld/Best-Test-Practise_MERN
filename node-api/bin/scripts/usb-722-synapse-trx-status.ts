import * as csv from 'csv-parse';
import { QueryTypes } from 'sequelize';
import { getGCSFileStream } from '../../src/lib/gcloud-storage';
import { AuditLog, SubscriptionBilling, sequelize } from '../../src/models';
import logger from '../../src/lib/logger';

const { BUCKET_NAME, REMOTE_FILEPATH } = process.env;

export async function updateBillingRecord(externalId: string, referenceId: string) {
  const query = `
    SELECT b.id billingId, b.user_id userId
    FROM subscription_billing b
    JOIN subscription_payment_line_item as li
    ON b.id = li.subscription_billing_id
    JOIN subscription_payment p
    ON p.id = li.subscription_payment_id
    WHERE b.billing_cycle = '2020-12'
    AND (p.external_id = ? or p.reference_id = ?);
  `;

  const [row]: Array<{ billingId: number; userId: number }> = await sequelize.query(query, {
    replacements: [externalId, referenceId],
    type: QueryTypes.SELECT,
  });

  if (!row) {
    return 0;
  }

  const subscriptionBilling = await SubscriptionBilling.findByPk(row.billingId);

  await subscriptionBilling.update({ amount: 0.0 });

  await AuditLog.create({
    message: `Waived subscription for December 2020 due to synapse returned transaction`,
    extra: { billingCycle: '2020-12', newAmount: 0 },
    userId: row.userId,
    eventUuid: row.billingId,
    type: AuditLog.TYPES.WAIVE_SUBSCRIPTION_MONTH,
    successful: true,
  });

  return 1;
}

async function run(): Promise<void> {
  let changedRecords = 0;
  return new Promise(async (resolve, reject) => {
    const readStream = await getGCSFileStream(BUCKET_NAME, REMOTE_FILEPATH);

    readStream
      .pipe(
        csv({
          skip_lines_with_error: true,
          columns: true,
        }),
      )
      .on('data', async data => {
        if (data.amount > 1) {
          return;
        }
        readStream.pause();

        logger.info(`Current running at external id ${data.id} with status ${data.status}`);

        changedRecords += await updateBillingRecord(data.id, data.extra_note);
        readStream.resume();
      })
      .on('error', reject)
      .on('end', () => {
        logger.info(`Processed $${changedRecords} in waived subscription fees`);
        resolve();
      });
  });
}

run()
  .then(() => {
    logger.info('Finished waiving December subscription payments');
    process.exit();
  })
  .catch(error => {
    logger.error('Error waiving December subscription payments', error);
    process.exit(1);
  });
