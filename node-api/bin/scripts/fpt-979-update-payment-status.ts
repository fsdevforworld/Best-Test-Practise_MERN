import * as _ from 'lodash';
import * as Bluebird from 'bluebird';
import { Op } from 'sequelize';
import { Moment, moment } from '@dave-inc/time-lib';
import { ExternalTransactionStatus } from '@dave-inc/wire-typings';

import { PaymentUpdateTrigger, updatePayment } from '../../src/domain/payment';
import { wrapMetrics } from '../../src/lib/datadog-statsd';
import { getCSVFile } from '../../src/lib/gcloud-storage';
import logger from '../../src/lib/logger';
import { AdminComment, AuditLog, Advance, Payment } from '../../src/models';
import { normalizeTransactionStatus } from '../../src/domain/synapsepay';

const enum Metrics {
  ProcessRow = 'synapse-status-patch.process-row',
  NewAdvances = 'synapse-status-patch.newly-taken-advances',
  UpdateLoggingError = 'synapse-status-patch.error-logging-update',
  NewAdvanceLoggingError = 'synapse-status-patch.error-logging-new-advances',
  PaymentAmount = 'synapse-status-patch.payment-amount',
  NewAdvanceAmount = 'synapse-status-patch.new-advances-amount',
}
const metrics = wrapMetrics<Metrics>();

export const enum ProcessingResult {
  PaymentNotFound = 'payment-not-found',
  OutsideTimeWindow = 'outside-time-window',
  UpdateOutdated = 'updated-outdated',
  StatusMatchesUpdate = 'no-update-needed',
  SynapseStatusNotReturned = 'synapse-status-not-returned',
  Success = 'success',
}

const {
  BUCKET_NAME = 'dave-173321',
  PAYMENT_UPDATES_CSV = 'scripts/FPT-977-synapse-returns-20210427/statuses-to-update.csv',
  MIN_DATE = '2021-04-21',
  MAX_DATE = new Date().toISOString(),
} = process.env;

type CsvStatusUpdate = {
  ID: string;
  STATUS: string;
  SYN_STATUS: string;
  SYN_UPDATED: string;
};

async function updatePaymentStatus(
  payment: Payment,
  currentStatus: ExternalTransactionStatus,
  synapseStatus: ExternalTransactionStatus,
): Promise<void> {
  // updatePayment does the following:
  // update status
  // publish update event
  // update Advance.outstanding
  // create audit log
  const shouldNotifyUser = false;
  await updatePayment(
    payment,
    {
      status: synapseStatus,
    },
    shouldNotifyUser,
    PaymentUpdateTrigger.AdminScript,
  );

  metrics.increment(Metrics.PaymentAmount, payment.amount);

  try {
    // updatePayment auditlogs the status, but we need to create
    // additional audit logging to indicate this was extraordinary
    await AuditLog.create({
      message: 'Payment synced to Synapse status',
      extra: { previousStatus: currentStatus, newStatus: synapseStatus },
      userId: payment.userId,
      eventUuid: payment.id,
      type: 'SYNAPSE_RETURN_STATUS_SYNC',
      successful: true,
    });

    await AdminComment.create({
      authorId: 5812549, // chen@dave.com
      userId: payment.userId,
      message: `ACH payment ${payment.id} for advance ${payment.advanceId} impacted by payment status sync-ing issues, corrected status from ${currentStatus} to ${synapseStatus}`,
    });
  } catch (error) {
    logger.error('Error logging payment update', {
      paymentId: payment.id,
      oldStatus: currentStatus,
      newStatus: synapseStatus,
      error,
    });
    metrics.increment(Metrics.UpdateLoggingError);
  }
}

async function checkForNewAdvances(originalAdvanceId: number, userId: number, after: Moment) {
  try {
    // Check for new advances taken out by user that should not have been, since
    // returned payment means the original advance was not paid off.
    const newAdvances = await Advance.findAll({
      where: {
        userId,
        disbursementStatus: ExternalTransactionStatus.Completed,
        created: {
          [Op.gt]: after,
        },
      },
    });

    await Bluebird.each(newAdvances, async advance => {
      metrics.increment(Metrics.NewAdvances);
      metrics.increment(Metrics.NewAdvanceAmount, advance.amount);

      await AuditLog.create({
        message: 'Advance erroneously taken on payment with missed RETURN status ',
        extra: {
          originalAdvanceId,
        },
        userId,
        eventUuid: advance.id,
        type: 'SYNAPSE_RETURN_STATUS_NEW_ADVANCE_TAKEN',
        successful: true,
      });

      await AdminComment.create({
        authorId: 5812549, // chen@dave.com
        userId,
        message: `Advance ${advance.id} disbursed when previous advance ${originalAdvanceId} was not fully collected, due to missed RETURN payment status`,
      });
    });
  } catch (error) {
    logger.error('Error checking for newly taken advances', {
      userId,
      error,
    });
    metrics.increment(Metrics.NewAdvanceLoggingError);
  }
}

export async function updatePaymentRow(
  paymentId: number,
  status: string,
  synapseStatus: ExternalTransactionStatus,
  _synapseUpdated: Moment,
): Promise<ProcessingResult> {
  const payment = await Payment.findByPk(paymentId, {
    include: [Advance],
  });

  if (_.isNil(payment)) {
    logger.error('Payment not found', { paymentId, status, synapseStatus });
    return ProcessingResult.PaymentNotFound;
  }

  const currentStatus = payment.status;
  if (currentStatus !== synapseStatus) {
    await updatePaymentStatus(payment, currentStatus, synapseStatus);
    await checkForNewAdvances(payment.advanceId, payment.userId, payment.created);
    return ProcessingResult.Success;
  } else {
    return ProcessingResult.StatusMatchesUpdate;
  }
}

async function syncPaymentsToStatusFile(
  bucketName: string,
  statusFile: string,
  minDate: Moment,
  maxDate: Moment,
): Promise<void> {
  const rows = getCSVFile(bucketName, statusFile, { columns: true });

  let nRows = 0;
  await Bluebird.mapSeries(rows as Promise<CsvStatusUpdate[]>, async (row: CsvStatusUpdate) => {
    const synUpdated = moment(row.SYN_UPDATED);
    const synapseStatus = normalizeTransactionStatus(row.SYN_STATUS);

    let result: ProcessingResult;

    if (synapseStatus !== ExternalTransactionStatus.Returned) {
      result = ProcessingResult.SynapseStatusNotReturned;
    } else if (synUpdated.isBetween(minDate, maxDate)) {
      const paymentId = parseInt(row.ID, 10);
      result = await updatePaymentRow(paymentId, row.STATUS, synapseStatus, synUpdated);
    } else {
      result = ProcessingResult.OutsideTimeWindow;
    }

    metrics.increment(Metrics.ProcessRow, {
      result,
    });

    nRows++;
  });

  logger.info('processing complete', { nRows });
}

async function run() {
  logger.info('Updating Synapse payment statuses', {
    env: {
      PAYMENT_UPDATES_CSV,
      MIN_DATE,
      MAX_DATE,
    },
  });

  await syncPaymentsToStatusFile(
    BUCKET_NAME,
    PAYMENT_UPDATES_CSV,
    moment(MIN_DATE),
    moment(MAX_DATE),
  );
}

if (require.main === module) {
  run()
    .then(() => {
      logger.info('Finished updating Synapse payment statuses');
      process.exit();
    })
    .catch(error => {
      logger.error('Error updating Synapse payment statuses', { error });
      process.exit(1);
    });
}
