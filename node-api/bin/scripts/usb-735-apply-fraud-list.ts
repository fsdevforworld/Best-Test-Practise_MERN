import * as csv from 'csv-parse';
import { Op } from 'sequelize';
import { getGCSFileStream } from '../../src/lib/gcloud-storage';
import { Payment } from '../../src/models';
import { flagUnauthorizedTransaction } from '../../src/consumers/synapsepay-upsert-transaction/process-upsert-transaction';
import logger from '../../src/lib/logger';

const { BUCKET_NAME, REMOTE_FILEPATH } = process.env;

export async function addFraudAlert(externalId: string, referenceId: string) {
  const payment = await Payment.findOne({
    where: {
      [Op.or]: [{ externalId }, { referenceId }],
    },
  });

  if (!payment) {
    logger.error(
      `Error finding payment with external id ${externalId} or reference id ${referenceId}`,
    );
    return;
  }

  return flagUnauthorizedTransaction(payment);
}

async function run(): Promise<void> {
  let runningTotal = 0;

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
        const { id, amount: amountString, status_note: errorCode, extra_note: referenceId } = data;
        const amount = parseFloat(amountString);

        if (amount === 1) {
          return;
        }
        if (!errorCode.match(/R05|R07|R10|R29|R51/g)) {
          return;
        }

        readStream.pause();

        runningTotal += amount;
        await addFraudAlert(id, referenceId);

        readStream.resume();
      })
      .on('error', reject)
      .on('end', () => {
        logger.info(`Processed $${runningTotal} in fraudulent transactions`);
        resolve();
      });
  });
}

run()
  .then(() => {
    logger.info('Finished updating synapsepay returned payments fraudulent transactions');
    process.exit();
  })
  .catch(error => {
    logger.error('Error updating synapsepay returned payments fraudulent transactions', error);
    process.exit(1);
  });
