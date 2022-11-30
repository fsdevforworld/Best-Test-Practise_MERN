import { expect } from 'chai';

import { InvalidParametersError } from '../../../src/lib/error';
import { validateBirthdate } from '../../../src/domain/user-updates';
import { moment } from '@dave-inc/time-lib';

describe('validateBirthdate', () => {
  it('Should pass with birthday', () => {
    const eighteenYearsAgo = moment().subtract(18, 'years');
    validateBirthdate(eighteenYearsAgo);
  });

  it('Should pass with birthday from input', () => {
    const twoThousandBirthday = moment('2000-01-01');
    validateBirthdate(twoThousandBirthday);
  });

  it('Should fail on birthday more recent than 18 years old', () => {
    const youngBirthday = moment().subtract(17, 'years');

    expect(() => validateBirthdate(youngBirthday)).to.throw(
      InvalidParametersError,
      'Invalid birthdate: user must be at least 18 years old',
    );
  });
});
