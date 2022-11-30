import { expect } from 'chai';
import * as sinon from 'sinon';
import factory from '../../factories';

import { UserAddress as Model } from '../../../src/models';
import { clean } from '../../test-helpers';
import * as UserAddress from '../../../src/domain/user-address';

describe('User address domain', () => {
  const sandbox = sinon.createSandbox();
  before(() => clean());
  afterEach(() => clean(sandbox));

  describe('createUserAddress', () => {
    it('should add to user_address', async () => {
      const user = await factory.create('user');
      const userId = user.id;
      await UserAddress.createUserAddress(userId, {
        addressLine1: 'Some Address',
        city: 'Fremont',
        state: 'CA',
        zipCode: '94538',
      });
      const record = await Model.findOne({ where: { userId } });
      expect(record.userId).to.equal(userId);
      expect(record.addressLine1).to.equal('Some Address');
      expect(record.addressLine2).to.equal(null);
      expect(record.city).to.equal('Fremont');
      expect(record.state).to.equal('CA');
      expect(record.zipCode).to.equal('94538');
    });

    it('should ignore incomplete address', async () => {
      const user = await factory.create('user');
      const userId = user.id;
      await UserAddress.createUserAddress(userId, {
        city: 'Fremont',
        state: 'CA',
        zipCode: '94538',
      });
      const record = await Model.findOne({ where: { userId } });
      expect(record).to.equal(null);
    });
  });
});
