import sendgrid from '../lib/sendgrid';
import { Advance } from '../models';
//@ts-ignore this is actually exported from json2csv...
import { parseAsync } from 'json2csv';
import { dogstatsd } from '../lib/datadog-statsd';
import { dateInTimezone, DEFAULT_TIMEZONE, moment } from '@dave-inc/time-lib';
import { Moment } from 'moment';
import { isBankingDay } from '../lib/banking-days';
import { Op } from 'sequelize';
import { Cron, DaveCron } from './cron';
import logger from '../lib/logger';

const SENDGRID_SUBJECT = 'Pending Advances';
const SENDGRID_TEMPLATE = 'd-8798c380a2764908b7c698b1918d4013';
const SENDGRID_SUBSTITUTIONS: any = undefined;
const SENDGRID_TO = 'pending.advances@dave.com';
const SENDGRID_CUSTOM_ARGS: any = undefined;
const SENDGRID_FROM = 'no-reply@dave.com';
const SENDGRID_CATEGORIES: any = undefined;
const SENDGRID_FROM_NAME = 'Dave';

function getTimeframe(today: Moment) {
  let endThreshold;
  let startThreshold;
  const yesterdayThreshold = today
    .clone()
    .subtract(1, 'days')
    .startOf('day')
    .add(16, 'hours'); // if report is running Friday, this 4pm local time Wednesday
  // if today is a weekday and yesterday is neither a weekend nor a holiday, threshold is just start of today
  if (isBankingDay(yesterdayThreshold) && isBankingDay(today)) {
    const beginThreshold = yesterdayThreshold.clone().utc();
    startThreshold = beginThreshold.format();
    endThreshold = beginThreshold
      .clone()
      .add(1, 'days')
      .format();
  } else if (!isBankingDay(yesterdayThreshold) || !isBankingDay(today)) {
    //no matter what, threshold will be at least 2 business days before report date, or one before "today"
    let offset: number = 1;
    const days = [1, 1];
    const currentDay = today.clone();
    days.forEach((num: number) => {
      if (!isBankingDay(currentDay)) {
        offset += 1;
      }
      currentDay.subtract(1, 'day');
    });
    while (!isBankingDay(currentDay)) {
      offset += 1;
      currentDay.subtract(1, 'days');
    }
    startThreshold = today
      .clone()
      .subtract(offset, 'days')
      .add(16, 'hours');
    if (!isBankingDay(startThreshold)) {
      startThreshold.subtract(1, 'day');
    }
    startThreshold = startThreshold.utc().format();
    const startThresholdCopy = today
      .clone()
      .subtract(offset, 'days')
      .add(16, 'hours');
    if (isBankingDay(startThresholdCopy.clone().add(1, 'days'))) {
      endThreshold = startThresholdCopy
        .clone()
        .add(1, 'days')
        .utc()
        .format();
    } else if (isBankingDay(today)) {
      endThreshold = yesterdayThreshold
        .clone()
        .add(1, 'days')
        .utc()
        .format();
    } else {
      let endOffset = 0;
      const cursor = startThresholdCopy.clone().add(1, 'days');
      while (!isBankingDay(cursor)) {
        cursor.add(1, 'day');
        endOffset += 1;
      }
      endThreshold = startThresholdCopy
        .clone()
        .add(endOffset, 'days')
        .utc()
        .format();
    }
  }
  return { startThreshold, endThreshold };
}

async function generateCSVReport(advances: Advance[]) {
  const fields = Object.keys(Advance.rawAttributes);
  const stringifiedAdvances = advances.map(advance => JSON.stringify(advance.toJSON()));
  const opts = { fields };
  const report = await parseAsync(stringifiedAdvances, opts);
  const reportPath = `${moment().format('YYYY-MM-DD')}-pending-advances.csv`;
  return { reportPath, report };
}

// task will run at midnight but the script running this will pass in the previous day's date to avoid date offset confusion
export async function run(date?: string): Promise<void> {
  date =
    date ||
    moment()
      .subtract(1, 'days')
      .format('YYYY-MM-DD');
  dogstatsd.increment('notify_pending_advances.task_started');
  const reportRunDay = dateInTimezone(date, DEFAULT_TIMEZONE).add(1, 'days');
  if (isBankingDay(reportRunDay)) {
    const { startThreshold, endThreshold } = getTimeframe(dateInTimezone(date, DEFAULT_TIMEZONE));
    const outstandingAdvances = await Advance.findAll({
      where: {
        disbursementStatus: 'PENDING',
        created: {
          [Op.between]: [startThreshold, endThreshold],
        },
      },
    });
    const { reportPath, report } = await generateCSVReport(outstandingAdvances);
    if (outstandingAdvances.length) {
      await sendgrid.send(
        SENDGRID_SUBJECT,
        SENDGRID_TEMPLATE,
        SENDGRID_SUBSTITUTIONS,
        SENDGRID_TO,
        SENDGRID_CUSTOM_ARGS,
        SENDGRID_FROM,
        SENDGRID_CATEGORIES,
        SENDGRID_FROM_NAME,
        [
          {
            content: Buffer.from(report).toString('base64'),
            filename: reportPath,
            type: 'plain/text',
            disposition: 'attachment',
          },
        ],
      );
    }
    dogstatsd.increment(
      'notify_pending_advances.advances_not_disbursed',
      outstandingAdvances.length,
    );
  } else {
    logger.info('not running because weekend or holiday');
  }
}

export const NotifyPendingAdvances: Cron = {
  name: DaveCron.NotifyPendingAdvances,
  process: run,
  schedule: '04 21 * * *',
};
