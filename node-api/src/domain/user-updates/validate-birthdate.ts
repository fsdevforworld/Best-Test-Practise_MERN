import { InvalidParametersError } from '../../../src/lib/error';
import { Moment, moment } from '@dave-inc/time-lib';

function validateBirthdate(birthdate: Moment) {
  const isOldEnough = birthdate.isBefore(
    moment()
      .subtract(18, 'years')
      .add(1, 'day'),
  );

  if (!isOldEnough) {
    throw new InvalidParametersError('Invalid birthdate: user must be at least 18 years old');
  }
}

export default validateBirthdate;
