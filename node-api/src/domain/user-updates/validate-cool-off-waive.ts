import { User } from '../../models';
import { InvalidParametersError } from '../../../src/lib/error';
import { moment } from '@dave-inc/time-lib';

function validateCoolOffWaive(user: User) {
  const { overrideSixtyDayDelete } = user;

  if (!user.isSoftDeleted()) {
    throw new InvalidParametersError('Cannot waive cool-off period for active user.');
  }

  const daysDeleted = moment().diff(moment(user.deleted), 'days');

  if (daysDeleted >= 60) {
    throw new InvalidParametersError("User's cool-off period has already worn off.");
  }

  if (overrideSixtyDayDelete) {
    throw new InvalidParametersError("User's cool-off period has already been waived.");
  }
}

export default validateCoolOffWaive;
