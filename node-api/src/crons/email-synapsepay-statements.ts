import { getSynapsePayUserStatements } from '../domain/synapsepay/user';
import { Statement } from 'synapsepay';
import { moment } from '@dave-inc/time-lib';
import sendgrid from '../lib/sendgrid';
import SynapsepayNodeLib from '../domain/synapsepay/node';
import Constants from '../domain/synapsepay/constants';
import { User } from '../models';
import { dogstatsd } from '../lib/datadog-statsd';
import { Cron, DaveCron } from './cron';

/**
 * Fired monthly to send Synapsepay statements to finance department.
 */
export async function emailSynapsepayStatements(): Promise<void> {
  const destinationEmail = ['kyle@dave.com', 'ryanimai@dave.com'];
  let pointInTime = moment().subtract(1, 'month');
  const user = { synapsepayId: Constants.SYNAPSEPAY_DISBURSING_USER_ID } as User;
  const extras = { fingerPrint: Constants.SYNAPSEPAY_DISBURSING_USER_FINGERPRINT };

  const nodes = await SynapsepayNodeLib.getAllSynapsePayNodes(user, extras);
  const statements = await getSynapsePayUserStatements(user, extras);

  // Start of day is important because synapsepay's statements return
  // unix timestamps at the resolution of a day _inclusively_ (meaning
  // the end date is the last day of the month.
  pointInTime = pointInTime
    .clone()
    .utc() // Important for comparing times with Synapsepay.
    .startOf('day');

  let emailBody = statements
    .filter(isForLastMonth)
    .map(statementToHtml)
    .sort()
    .join('<br><br>');
  if (!emailBody) {
    dogstatsd.increment('email_synapsepay_statements.no_reports_found', 1, [
      `date:${pointInTime.format('MMMM YYYY')}`,
    ]);
    emailBody = `No reports for ${pointInTime.format('MMMM YYYY')} were found.`;
  }

  const subject = `SynapsePay reports for ${pointInTime.format('MMMM YYYY')}`;
  await sendgrid.sendHtml(subject, emailBody, destinationEmail);

  dogstatsd.increment('email_synapsepay_statements.report_emailed');

  /**
   * Statements are assumed to have their dates in UTC and as inclusive
   * boundary markers for their relevant months (eg Jan 1 and Jan 31).
   */
  function isForLastMonth(statement: Statement): boolean {
    const startDate = moment(statement.date_start);
    const endDate = moment(statement.date_end);
    return pointInTime.isSameOrAfter(startDate) && pointInTime.isSameOrBefore(endDate);
  }

  /**
   * Makes a statement human readable.
   *
   * WARNING: Information we get from Synapsepay is not sanitized before
   * being injected into the html.
   */
  function statementToHtml(statement: Statement): string {
    const url = statement.urls.csv;
    const statementNode = nodes.find(node => node.json._id === statement.node_id);
    let title = '(node not found)';
    if (statementNode) {
      title = statementNode.json.info.nickname || '(node nickname not found)';
    }
    return `${title}<br>${url}`;
  }
}

export const EmailSynapsepayStatements: Cron = {
  name: DaveCron.EmailSynapsepayStatements,
  process: emailSynapsepayStatements,
  schedule: '6 16 16 * *',
};
