import { expect, use } from 'chai';
import chaiAsPromised from 'chai-as-promised';
import factory from '../factories';
import { clean } from '../test-helpers';
import { moment } from '@dave-inc/time-lib';
import { MembershipPause } from '../../src/models';

describe('MembershipPause', () => {
  before(() => clean());
  afterEach(() => clean());

  describe('index: active_membership_pause', () => {
    it('should error when creating a new paused membership for a user who is already has an active paused membership', async () => {
      use(() => chaiAsPromised);
      const user = await factory.create('user');
      await factory.create('membership-pause', { userId: user.id });
      await expect(MembershipPause.create({ userId: user.id })).to.be.rejected;
    });
  });

  describe('isActive', () => {
    it('should return true when membership pause is active', async () => {
      const user = await factory.create('user');
      const mp = await factory.create('membership-pause', { userId: user.id });
      expect(mp.isActive()).to.be.true;
    });

    it('should return false when membership pause is not yet active', async () => {
      const user = await factory.create('user');
      const pausedAt = moment().add(30, 'days');
      const mp = await factory.create('membership-pause', {
        userId: user.id,
        pausedAt,
      });
      expect(mp.isActive()).to.be.false;
    });

    it('should return false when membership pause has ended', async () => {
      const user = await factory.create('user');
      const pausedAt = moment().subtract(30, 'days');
      const unpausedAt = moment().subtract(1, 'minute');
      const mp = await factory.create('membership-pause', {
        userId: user.id,
        pausedAt,
        unpausedAt,
      });
      expect(mp.isActive()).to.be.false;
    });
  });
});
