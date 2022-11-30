import { moment } from '@dave-inc/time-lib';

function isDateTime(dateTime: string): boolean {
  return moment(dateTime, 'YYYY-MM-DDTHH:mm:ss').isValid();
}

export default isDateTime;
