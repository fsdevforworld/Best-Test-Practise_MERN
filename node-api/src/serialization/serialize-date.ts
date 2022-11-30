import { moment } from '@dave-inc/time-lib';
import { Moment } from 'moment';

/** Formats a date using moment.format() but gracefully handles null, this is useful for serialization */
export function serializeDate(date: Date | Moment | string, format: string = null): string {
  if (!date) {
    return null;
  }

  const asMoment = moment(date);

  if (!asMoment.isValid()) {
    return null;
  }

  return asMoment.format(format);
}
