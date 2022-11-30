import { ExternalTransactionStatus } from '@dave-inc/wire-typings';
import { PaymentGateway, PaymentProcessor } from '@dave-inc/loomis-client';
import { Advance } from '../../src/models';
import AdvanceHelper from '../../src/helper/advance';
import logger from '../../src/lib/logger';
import { dogstatsd } from '../../src/lib/datadog-statsd';

const VISA_OUTAGE_ADVANCES = [
  25375804,
  25375805,
  25375807,
  25375808,
  25375809,
  25375810,
  25375811,
  25375813,
];

async function run() {
  logger.info('Starting marking visa outage advances as canceled');
  let index = 0;

  while (index < VISA_OUTAGE_ADVANCES.length) {
    const advance = await Advance.findByPk(VISA_OUTAGE_ADVANCES[index]);
    await AdvanceHelper.updateDisbursementStatus(advance, ExternalTransactionStatus.Canceled);

    dogstatsd.increment('update_disbursement.advance_canceled', {
      delivery: advance.delivery,
      gateway: PaymentGateway.Tabapay,
      processor: PaymentProcessor.Tabapay,
    });

    index += 1;
  }
}

run()
  .then(() => {
    logger.info(`Finished marking visa outage advances pending as canceled`);
    process.exit();
  })
  .catch(error => {
    logger.error(`Error marking visa outage advances pending as canceled`, error);
    process.exit(1);
  });
