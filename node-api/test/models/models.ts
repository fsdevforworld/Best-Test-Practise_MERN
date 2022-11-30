import * as Bluebird from 'bluebird';
import { moment } from '@dave-inc/time-lib';
import { User } from '../../src/models';
import { expect } from 'chai';
import { clean } from '../test-helpers';

function makeUser(props: any): Bluebird<User> {
  return User.create({
    phoneNumber: '+11234567890',
    settings: {},
    ...props,
  });
}

describe('Model', () => {
  // clean everything before we start
  before(() => clean());

  afterEach(() => clean());

  describe('DATEONLY field', () => {
    it('should become a Moment instance if created with a string', async () => {
      const user = await makeUser({ birthdate: '1990-01-01' });
      expect(user.birthdate instanceof moment).to.equal(true);
      expect(moment('1990-01-01').isSame(user.birthdate)).to.equal(true);
    });

    it('should remain a Moment instance if created with a Moment instance', async () => {
      const user = await makeUser({ birthdate: moment('1990-01-01') });
      expect(user.birthdate instanceof moment).to.equal(true);
      expect(moment('1990-01-01').isSame(user.birthdate)).to.equal(true);
    });

    it('should become a Moment instance if created with a Date instance', async () => {
      const user = await makeUser({ birthdate: new Date(Date.UTC(1990, 0, 1)) });
      expect(user.birthdate instanceof moment).to.equal(true);
      expect(moment('1990-01-01').isSame(user.birthdate)).to.equal(true);
    });

    it('should be represented as a Moment instance on read', async () => {
      await makeUser({ birthdate: '1990-01-01' });
      const user = (await User.findAll())[0];
      expect(user.birthdate).to.be.an.instanceof(moment);
      expect(user.birthdate.format('YYYY-MM-DD')).to.equal('1990-01-01');
    });

    it('should be saved to the db correctly after set as Moment instance', async () => {
      await makeUser({ birthdate: '1990-01-01' });
      const user = (await User.findAll())[0];
      user.birthdate = moment('1990-01-02');
      await user.save();
      const userUpdated = await User.findByPk(user.id);
      expect(user.birthdate).to.be.an.instanceof(moment);
      expect(userUpdated.birthdate.isSame(moment('1990-01-02'))).to.equal(true);
    });
  });

  describe('DATE field', () => {
    it('should become a Moment instance if created with a string', async () => {
      const user = await makeUser({ lastActive: '1990-01-01T00:00:00Z' });
      expect(user.lastActive instanceof moment).to.equal(true);
      expect(user.lastActive.toISOString()).to.equal('1990-01-01T00:00:00.000Z');
    });

    it('should remain a Moment instance if created with a Moment instance', async () => {
      const user = await makeUser({ lastActive: moment('1990-01-01 00:00:00') });
      expect(user.lastActive instanceof moment).to.equal(true);
      expect(user.lastActive.toISOString()).to.equal('1990-01-01T00:00:00.000Z');
    });

    it('should become a Moment instance if created with a Date instance', async () => {
      const user = await makeUser({ lastActive: new Date('1990-01-01T00:00:00Z') });
      expect(user.lastActive instanceof moment).to.equal(true);
      expect(user.lastActive.toISOString()).to.equal('1990-01-01T00:00:00.000Z');
    });

    it('should be represented as a Moment instance on read', async () => {
      await makeUser({ lastActive: '1990-01-01T00:00:00Z' });
      const user = (await User.findAll())[0];
      expect(user.lastActive instanceof moment).to.equal(true);
      expect(user.lastActive.format('YYYY-MM-DD HH:mm:ss')).to.equal('1990-01-01 00:00:00');
    });

    it('should be represented as a Moment instance after set as Moment instance', async () => {
      await makeUser({ lastActive: '1990-01-01 00:00:00' });
      const user = (await User.findAll())[0];
      user.lastActive = moment('1990-01-02 00:00:00');
      expect(user.lastActive instanceof moment).to.equal(true);
      expect(user.lastActive.toISOString()).to.equal('1990-01-02T00:00:00.000Z');
    });

    it('should be saved to the db correctly after set as Moment instance', async () => {
      await makeUser({ lastActive: '1990-01-01 00:00:00' });
      const user = (await User.findAll())[0];
      user.lastActive = moment('1990-01-01 00:00:01');
      await user.save();
      const userUpdated = await User.findByPk(user.id);
      expect(user.lastActive).to.be.an.instanceof(moment);
      expect(userUpdated.lastActive.isSame(moment('1990-01-01 00:00:01'))).to.equal(true);
    });
  });
});
