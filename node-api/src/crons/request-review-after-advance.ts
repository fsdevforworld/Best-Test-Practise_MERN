import * as Bluebird from 'bluebird';
import * as Notification from '../domain/notifications';
import { moment } from '@dave-inc/time-lib';
import { Advance } from '../models';
import { Op } from 'sequelize';
import { AdvanceDelivery } from '@dave-inc/wire-typings';
import { Cron, DaveCron } from './cron';
import logger from '../lib/logger';

export async function requestReviewAfterAdvance() {
  const datetimeFormat = 'YYYY-MM-DD HH:mm:ss';
  const start = moment()
    .subtract(36, 'hours')
    .format(datetimeFormat);
  const end = moment()
    .subtract(12, 'hours')
    .format(datetimeFormat);

  const advances = Advance.findAll({
    where: {
      created: {
        [Op.between]: [start, end],
      },
      delivery: AdvanceDelivery.Express,
    },
  });
  await Bluebird.map(
    advances,
    async (row: any) => {
      try {
        await Notification.sendDisburseCompleted(row.id);
      } catch (error) {
        logger.error('Error sending disbursement completed', { error });
      }
    },
    { concurrency: 20 },
  );
}

export const RequestReviewAfterAdvance: Cron = {
  name: DaveCron.RequestReviewAfterAdvance,
  process: requestReviewAfterAdvance,
  schedule: '0 17 * * *',
};
