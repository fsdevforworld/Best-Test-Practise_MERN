import * as csv from 'csv-parse';
import { ExternalTransactionStatus } from '@dave-inc/wire-typings';
import { getGCSFileStream } from '../../src/lib/gcloud-storage';
import { AdminComment, Payment } from '../../src/models';
import logger from '../../src/lib/logger';

let runningTotal = 0;

const { BUCKET_NAME, REMOTE_FILEPATH } = process.env;
const message = 'December 2020 ACH return incident:  Advance forgiveness.';

async function updateStatus(paymentId: number) {
  const payment = await Payment.findByPk(paymentId);

  if (!payment) {
    logger.error(`Error finding payment with primary key ${paymentId}`);
    return;
  }

  const { userId, externalProcessor, status, updated, modifications } = payment;

  logger.info(`Found payment ${paymentId}`, {
    userId,
    externalProcessor,
    status,
    updated,
    modifications,
  });

  if (payment.status === ExternalTransactionStatus.Completed) {
    return;
  }

  try {
    logger.info(`Updating payment ${paymentId}`);

    await payment.update({
      status: ExternalTransactionStatus.Completed,
    });

    await AdminComment.create({
      userId: payment.userId,
      message,
      isHighPriority: true,
      authorId: 4372515, // Genevieve Hastback user Id
    });
  } catch (err) {
    logger.error(`Failed updating payment ${paymentId}`, err);
  }

  runningTotal += 1;
}

async function run(): Promise<void> {
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
        const { paymentId } = data;

        readStream.pause();

        logger.info(`Processing payment ${paymentId}`);

        await updateStatus(paymentId);

        readStream.resume();
      })
      .on('error', reject)
      .on('end', () => {
        logger.info(`Processed ${runningTotal} payment transactions`);
        resolve();
      });
  });
}

run()
  .then(() => {
    logger.info('Finished updating payments for dd bod users');
    process.exit();
  })
  .catch(error => {
    logger.error('Error updating payments for dd bod users', error);
    process.exit(1);
  });
