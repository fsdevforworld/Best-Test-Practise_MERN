/* tslint:disable:no-string-literal */
import { sequelize } from '../models';
import { round } from 'lodash';
import { dogstatsd } from '../lib/datadog-statsd';
import { moment } from '@dave-inc/time-lib';
import { Cron, DaveCron } from './cron';

async function calculatePaymentProcessorRatios(): Promise<any> {
  const query = `SELECT external_processor, sum(amount) as A
                 FROM payment
                 WHERE status IN ('PENDING', 'COMPLETED')
                   and date_format(created, '%Y-%m-%d') >= curdate()
                 GROUP BY external_processor`;
  const [value]: any = await sequelize.query(query);
  const totalValue: number = value.reduce((accumulator: number, element: any) => {
    if (element['A']) {
      return (accumulator += element['A']);
    } else {
      return accumulator;
    }
  }, 0);

  const result: any = {};

  value.forEach((element: any) => {
    const processor = element['external_processor'];
    const amt = element['A'];
    const amount = amt / totalValue;
    result[processor] = round(amount, 2) * 100;
  });

  dogstatsd.event('Percentage of Synapsepay payments is too high', JSON.stringify(result), {
    date_happened: moment().toDate(),
    alert_type: 'warning',
    priority: 'normal',
  });
}

export const MonitorAdvanceCollection: Cron = {
  name: DaveCron.MonitorAdvanceCollection,
  process: calculatePaymentProcessorRatios,
  schedule: '0 14 * * 1-5',
};
