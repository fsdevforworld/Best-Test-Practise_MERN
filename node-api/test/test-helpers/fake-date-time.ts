import { Moment } from 'moment';
/**
 * Hacks the date and time to the Moment specified
 *
 * @param {sinon.SinonSandbox} sandbox
 * @param {Moment} dateTime
 * @returns {Promise<void>}
 */
export default function fakeDateTime(sandbox: sinon.SinonSandbox, dateTime: Moment) {
  sandbox.useFakeTimers(
    dateTime
      .clone()
      .toDate()
      .getTime(),
  );
}
