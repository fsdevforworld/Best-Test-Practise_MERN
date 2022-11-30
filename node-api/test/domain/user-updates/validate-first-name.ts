import { expect } from 'chai';
import { clean } from '../../test-helpers';
import factory from '../../factories';

import { InvalidParametersError } from '../../../src/lib/error';
import { validateFirstName } from '../../../src/domain/user-updates';

describe('validateFirstName', () => {
  before(() => clean());

  afterEach(() => clean());

  it('Should throw if banking user name does not match banking pattern', async () => {
    const user = await factory.create('user');
    await factory.create('bank-of-dave-bank-connection', { userId: user.id });
    const invalidBankingName = "zap's jr.";

    await expect(validateFirstName(user, invalidBankingName)).to.be.rejectedWith(
      InvalidParametersError,
      'Name is not formatted correctly',
    );
  });

  it('Should throw if core user name does not match core pattern', async () => {
    const user = await factory.create('user');
    const invalidBankingName = "zap's jr. 123";

    await expect(validateFirstName(user, invalidBankingName)).to.be.rejectedWith(
      InvalidParametersError,
      'Name is not formatted correctly',
    );
  });

  it('Should succeed with valid bank name', async () => {
    const user = await factory.create('user');
    await factory.create('bank-of-dave-bank-connection', { userId: user.id });
    const invalidBankingName = "zap's jr";

    await validateFirstName(user, invalidBankingName);
  });

  it('Should succeed with valid core name', async () => {
    const user = await factory.create('user');
    const invalidBankingName = "zap's jr.";

    await validateFirstName(user, invalidBankingName);
  });
});
