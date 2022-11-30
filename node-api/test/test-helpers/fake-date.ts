import { moment } from '@dave-inc/time-lib';
import fakeDateTime from './fake-date-time';

/**
 * Hacks the date to the date string specified
 * dateOnly format is 'YYYY-MM-DD' (e.g. '2012-08-23')
 *
 * @param {sinon.SinonSandbox} sandbox
 * @param {string} dateOnly
 * @returns {Promise<void>}
 */
export default function fakeDate(
  sandbox: sinon.SinonSandbox,
  dateOnly: string,
  format: string = 'YYYY-MM-DD',
) {
  fakeDateTime(sandbox, moment(dateOnly, format));
}
