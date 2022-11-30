import { moment } from '@dave-inc/time-lib';
import { BankingDataSource, ExternalTransactionStatus, UserRole } from '@dave-inc/wire-typings';
import * as bcrypt from 'bcrypt';
import { expect } from 'chai';
import * as sinon from 'sinon';
import { toE164 } from '../../src/lib/utils';
import { PasswordHistory, User, UserSession } from '../../src/models';
import factory from '../factories';
import { clean, fakeDate } from '../test-helpers';
import * as SynapsepayLib from '../../src/domain/synapsepay';
import AccountManagement from 'src/domain/account-management';

describe('User', () => {
  const sandbox = sinon.createSandbox();

  before(() => clean());

  afterEach(() => clean(sandbox));

  describe('model validation', () => {
    context('index: active_user_email', () => {
      it('should error when creating a user with an email that belongs to another active user', async () => {
        const email = '4@dave.com';

        await factory.create('user', { email });

        let errorName;
        let errorMessage;
        try {
          await User.create({ phoneNumber: '+11234567899', email });
        } catch (error) {
          errorName = error.name;
          errorMessage = error.message;
        }
        expect(errorName).to.be.equal('SequelizeUniqueConstraintError');
        expect(errorMessage).to.be.equal('Validation error');
      });

      it('should succeed when creating a user with an email that belongs to another user if they are deleted', async () => {
        const email = '4@dave.com';

        const user = await factory.create('user', { email });

        sandbox.stub(SynapsepayLib, 'deleteSynapsePayUser').resolves();

        await AccountManagement.removeUserAccountById({
          userId: user.id,
          reason: 'some reason',
          options: {
            additionalInfo: 'some additional info',
          },
        });

        let errorName;
        let errorMessage;
        try {
          await User.create({ phoneNumber: '+11234567899', email });
        } catch (error) {
          errorName = error.name;
          errorMessage = error.message;
        }

        expect(errorName).to.be.equal(undefined);
        expect(errorMessage).to.be.equal(undefined);
      });
    });
    context('index: unique_user_ulid', () => {
      it('should error when creating a user with ulid of another user', async () => {
        const ulid = 'i'.repeat(26);
        await factory.create('user', { userUlid: ulid });
        await expect(factory.create('user', { userUlid: ulid })).to.be.rejected;
      });
    });
  });

  describe('findOneByEmail', () => {
    it('finds the proper active user with an email', async () => {
      const email = 'alpha@omega.jeff';
      const userToBeDeleted = await factory.create('user', { email });
      await userToBeDeleted.destroy();
      const currentUser = await factory.create('user', { email });
      const user = await User.findOneByEmail(email);
      expect(user.id).to.eq(currentUser.id);
    });
  });

  describe('findOneByPhoneNumber', () => {
    it('should find an active user if exist with multiple deleted users of the same phone', async () => {
      const phoneNumber = '+16518006069';
      const deletedTimestamp = moment().subtract(1, 'month');
      await Promise.all([
        factory.create('user', {
          phoneNumber,
          email: 'user@dave.com',
        }),
        factory.create('user', {
          phoneNumber: `${phoneNumber}-deleted-1`,
          email: 'user@dave.com',
          deleted: deletedTimestamp.format('YYYY-MM-DD HH:mm:ss'),
        }),
        factory.create('user', {
          phoneNumber: `${phoneNumber}-deleted-2`,
          email: 'user@dave.com',
          deleted: deletedTimestamp.subtract(1, 'month').format('YYYY-MM-DD HH:mm:ss'),
        }),
      ]);

      const user = await User.findOneByPhoneNumber(phoneNumber, false);
      expect(user.isActive()).to.be.true;
    });

    it('should find an deleted user if no active user is found', async () => {
      const phoneNumber = '+16518006069';
      const deletedTimestamp = moment().subtract(1, 'month');

      await Promise.all([
        factory.create('user', {
          phoneNumber: `${phoneNumber}-deleted-1`,
          email: 'user@dave.com',
          deleted: deletedTimestamp.format('YYYY-MM-DD HH:mm:ss'),
        }),
        factory.create('user', {
          phoneNumber: `${phoneNumber}-deleted-2`,
          email: 'user@dave.com',
          deleted: deletedTimestamp.subtract(1, 'month').format('YYYY-MM-DD HH:mm:ss'),
        }),
      ]);

      const user = await User.findOneByPhoneNumber(phoneNumber, false);
      expect(user.isActive()).to.be.false;
    });
  });

  describe('findOneByPhoneNumberOrEmail', () => {
    it('finds the proper active user if exist with multiple deleted users of the same email', async () => {
      const email = 'alpha@omega.jeff';
      const [currentUser] = await Promise.all([
        factory.create('user', { email }),
        factory.create('user', { email, deleted: moment() }),
      ]);

      const user = await User.findOneByPhoneNumberOrEmail({ email });
      expect(user.id).to.eq(currentUser.id);
    });

    it('should find an active user if exist with multiple deleted users of the same phone', async () => {
      const rawPhoneNumber = '6518006069';
      const phoneNumber = toE164(rawPhoneNumber);
      const deletedTimestamp = moment().subtract(1, 'month');
      await Promise.all([
        factory.create('user', {
          phoneNumber,
        }),
        factory.create('user', {
          phoneNumber: `${phoneNumber}-deleted-1`,
          deleted: deletedTimestamp.format('YYYY-MM-DD HH:mm:ss'),
        }),
        factory.create('user', {
          phoneNumber: `${phoneNumber}-deleted-2`,
          deleted: deletedTimestamp.subtract(1, 'month').format('YYYY-MM-DD HH:mm:ss'),
        }),
      ]);

      const user = await User.findOneByPhoneNumberOrEmail({ phoneNumber: rawPhoneNumber });
      expect(user.isActive()).to.be.true;
    });

    it('should find an deleted user if no active user is found', async () => {
      const rawPhoneNumber = '6518006069';
      const phoneNumber = toE164(rawPhoneNumber);
      const deletedTimestamp = moment().subtract(1, 'month');

      await Promise.all([
        factory.create('user', {
          phoneNumber: `${phoneNumber}-deleted-1`,
          email: 'user@dave.com',
          deleted: deletedTimestamp.format('YYYY-MM-DD HH:mm:ss'),
        }),
        factory.create('user', {
          phoneNumber: `${phoneNumber}-deleted-2`,
          email: 'user@dave.com',
          deleted: deletedTimestamp.subtract(1, 'month').format('YYYY-MM-DD HH:mm:ss'),
        }),
      ]);

      const user = await User.findOneByPhoneNumberOrEmail({
        phoneNumber: rawPhoneNumber,
        paranoid: false,
      });
      expect(user.isActive()).to.be.false;
    });
  });

  describe('hasRoles', () => {
    it('returns true if user has the listed roles', async () => {
      const roles = [UserRole.tester];

      const user = await factory.create('user', {}, { roles });

      const hasRoles = await user.hasRoles(roles);

      expect(hasRoles).to.be.equal(true);
    });

    it('returns false if user does not have the listed roles', async () => {
      const user = await factory.create('user', {}, { roles: [] });

      const hasRoles = await user.hasRoles([UserRole.preReleaseAppTester]);

      expect(hasRoles).to.be.equal(false);
    });
  });

  describe('isPaused', () => {
    let user: User;

    beforeEach(async () => {
      user = await factory.create('user');
    });
    it('should return true when user is paused', async () => {
      await factory.create('membership-pause', { userId: user.id });
      const isPaused = await user.isPaused();
      expect(isPaused).to.be.true;
    });

    it('should return false when user is not paused', async () => {
      const isPaused = await user.isPaused();
      expect(isPaused).to.be.false;
    });

    it('should return false if membership was unpaused before future pause start date', async () => {
      const now = '2020-01-14';
      fakeDate(sandbox, now);
      const created = moment().subtract(4, 'days');
      await factory.create('membership-pause', {
        userId: user.id,
        created,
        pausedAt: created.add(1, 'month').startOf('month'),
        unpausedAt: created.add(1, 'day'),
      });
      const isPaused = await user.isPaused();
      expect(isPaused).to.be.false;
    });
  });

  describe('getCurrentMembershipPause', () => {
    let user: User;

    beforeEach(async () => {
      user = await factory.create('user');
    });

    it('should return the active membership pause record for a user', async () => {
      const [, , activeMembership] = await Promise.all([
        factory.create('membership-pause', {
          userId: user.id,
          unpausedAt: moment().add(1, 'day'),
        }),
        factory.create('membership-pause', {
          userId: user.id,
          unpausedAt: moment().add(2, 'day'),
        }),
        factory.create('membership-pause', {
          userId: user.id,
        }),
      ]);

      const membershipPause = await user.getCurrentMembershipPause();

      expect(membershipPause.userId).to.be.equal(activeMembership.userId);
      expect(membershipPause.id).to.be.equal(activeMembership.id);
    });

    it('should return nothing if there is no active membership pause record for a user', async () => {
      await factory.create('membership-pause', {
        userId: user.id,
        pausedAt: moment().subtract(10, 'days'),
        unpausedAt: moment(),
      });

      const membershipPause = await user.getCurrentMembershipPause();
      expect(membershipPause).to.not.exist;
    });

    it('should return nothing if membership was unpaused before future pause start date', async () => {
      const created = moment('2020-01-14');
      await factory.create('membership-pause', {
        userId: user.id,
        created,
        pausedAt: created.add(1, 'month').startOf('month'),
        unpausedAt: created.add(4, 'days'),
      });
      const membershipPause = await user.getCurrentMembershipPause();
      expect(membershipPause).to.not.exist;
    });

    it('should return nothing if there is no membership pause record for a user', async () => {
      const membershipPause = await user.getCurrentMembershipPause();
      expect(membershipPause).to.not.exist;
    });
  });

  describe('getRoleNames', () => {
    it('an array of the names for the roles that the user has', async () => {
      const roles = [UserRole.tester];

      const user = await factory.create('user', {}, { roles });

      const roleNames = await user.getRoleNames();
      expect(roleNames[0]).to.be.equal(UserRole.tester);
    });
  });

  describe('getSessionToken', () => {
    context('called called as static method', () => {
      it('should create a new UserSession and return the token', async () => {
        const user = await factory.create('user');
        const spyUserSessionCreate = sinon.spy(UserSession, 'create');

        const token = await User.getSessionToken(user.id, 'randomeDeviceId', 'android');
        expect(token).to.be.a('string');
        sinon.assert.calledOnce(spyUserSessionCreate);
        spyUserSessionCreate.restore();
      });

      it('should find the existing UserSession and return the token', async () => {
        const userSession = await factory.create('user-session');
        const spyUserSessionCreate = sinon.spy(UserSession, 'create');

        const token = await User.getSessionToken(
          userSession.userId,
          userSession.deviceId,
          'android',
        );
        expect(token).to.be.equal(userSession.token);
        sinon.assert.notCalled(spyUserSessionCreate);
        spyUserSessionCreate.restore();
      });
    });

    context('called as instance method', () => {
      it('should find the existing UserSession and return the token', async () => {
        const user = await factory.create('user');
        const userSession = await factory.create('user-session', { userId: user.id });
        const spyUserSessionCreate = sinon.spy(UserSession, 'create');

        const token = await user.getSessionToken(userSession.deviceId, 'android');

        expect(token).to.be.equal(userSession.token);
        sinon.assert.notCalled(spyUserSessionCreate);
        spyUserSessionCreate.restore();
      });
    });
  });

  describe('setPassword', () => {
    it('should parse out password requirements config succesfully', async () => {
      await factory.create('config', {
        key: 'PASSWORD_REQUIREMENTS',
        value: {
          minLength: 8,
        },
      });

      const user = await factory.create('user', { password: null });

      await user.setPassword('Testing34!');
    });

    it('should throw an invalid parameters error if the input is empty', async () => {
      const user = await factory.create('user', { password: null });

      try {
        await user.setPassword('');
        throw new Error('This should not happen');
      } catch (error) {
        expect(error.name).to.eql('InvalidParametersError');
        expect(error.statusCode).to.eql(400);
        expect(error.message).to.match(/Password must be/);
      }
    });

    it('should throw if the input is missing a digit', async () => {
      const user = await factory.create('user', { password: null });

      try {
        await user.setPassword('myVerySecurePassword!');
        throw new Error('This should not happen');
      } catch (error) {
        expect(error.name).to.eql('InvalidParametersError');
        expect(error.statusCode).to.eql(400);
        expect(error.message).to.match(/Password must be/);
      }
    });

    it('should throw if the input is missing an uppercase letter', async () => {
      const user = await factory.create('user', { password: null });

      try {
        await user.setPassword('myverysecurepassword1!');
        throw new Error('This should not happen');
      } catch (error) {
        expect(error.name).to.eql('InvalidParametersError');
        expect(error.statusCode).to.eql(400);
        expect(error.message).to.match(/Password must be/);
      }
    });

    it('should throw if the input is missing a lowercase letter', async () => {
      const user = await factory.create('user', { password: null });

      try {
        await user.setPassword('MYVERYSECUREPASSWORD1!');
        throw new Error('This should not happen');
      } catch (error) {
        expect(error.name).to.eql('InvalidParametersError');
        expect(error.statusCode).to.eql(400);
        expect(error.message).to.match(/Password must be/);
      }
    });

    it('should throw if the input is missing a special character', async () => {
      const user = await factory.create('user', { password: null });

      try {
        await user.setPassword('myVerySecurePassword1');
        throw new Error('This should not happen');
      } catch (error) {
        expect(error.name).to.eql('InvalidParametersError');
        expect(error.statusCode).to.eql(400);
        expect(error.message).to.match(/Password must be/);
      }
    });

    it('should consider a space as a special character', async () => {
      const user = await factory.create<User>('user', { password: null });

      await user.setPassword('myVery SecurePassword1');
      await user.save();
      await user.reload();

      const isValid = await bcrypt.compare('myVery SecurePassword1', user.password);
      expect(isValid).to.equal(true);
    });

    it('should consider tilde as a special character', async () => {
      const user = await factory.create<User>('user', { password: null });

      await user.setPassword('myVerySecurePassword1~');
      await user.save();
      await user.reload();

      const isValid = await bcrypt.compare('myVerySecurePassword1~', user.password);
      expect(isValid).to.equal(true);
    });

    it('should throw if the input is too short', async () => {
      const user = await factory.create('user', { password: null });

      try {
        await user.setPassword('');
        throw new Error('mVSP1!');
      } catch (error) {
        expect(error.name).to.eql('InvalidParametersError');
        expect(error.statusCode).to.eql(400);
        expect(error.message).to.match(/Password must be/);
      }
    });

    it('should set encrypted password in DB if the input is valid', async () => {
      const user = await factory.create('user', { password: null });

      await user.setPassword('myVerySecurePassword1!');
      await user.save();
      await user.reload();

      const isValid = await bcrypt.compare('myVerySecurePassword1!', user.password);
      expect(isValid).to.equal(true);
    });

    it('should save a record in the password history list', async () => {
      const user = await factory.create('user', { password: null });

      await user.setPassword('myVerySecurePassword1!');
      await user.save();

      const passwordHistories = await PasswordHistory.findAll({ where: { userId: user.id } });

      expect(passwordHistories.length).to.equal(1);

      const isValid = await bcrypt.compare('myVerySecurePassword1!', passwordHistories[0].password);
      expect(isValid).to.equal(true);
    });

    it('should not allow the user to use one of their previous three passwords', async () => {
      const user = await factory.create('user', { password: null });

      await user.setPassword('myVerySecurePassword1!');
      await user.save();

      try {
        await user.setPassword('myVerySecurePassword1!');
        throw new Error('Should have thrown on the previous line');
      } catch (error) {
        expect(error.message).to.equal('Cannot use one of your previous three passwords');
      }
    });

    it('should allow the user to use their fourth-most-recent password', async () => {
      const user = await factory.create('user', { password: null });

      await user.setPassword('myVerySecurePassword1!');
      await user.save();
      await user.setPassword('myVerySecurePassword2!');
      await user.save();
      await user.setPassword('myVerySecurePassword3!');
      await user.save();
      await user.setPassword('myVerySecurePassword4!');
      await user.save();
      await user.setPassword('myVerySecurePassword1!');
      await user.save();
    });
  });

  describe('#canBeDeleted', () => {
    it('returns false when the user has outstanding advances', async () => {
      const user = await factory.create('user');
      await factory.create('advance', { userId: user.id, outstanding: 10 });
      const result = await user.canBeDeleted();
      expect(result).to.eq(false);
    });

    it('returns false when the user has pending payments', async () => {
      const user = await factory.create('user');
      await factory.create('payment', {
        userId: user.id,
        status: ExternalTransactionStatus.Pending,
      });
      const result = await user.canBeDeleted();
      expect(result).to.eq(false);
    });

    it('returns false when the user has bank of dave', async () => {
      const user = await factory.create('user');
      await factory.create('bank-connection', {
        userId: user.id,
        bankingDataSource: BankingDataSource.BankOfDave,
      });
      const result = await user.canBeDeleted();
      expect(result).to.eq(false);
    });
  });

  describe('toJSON', () => {
    it('serializes the birthdate into YYYY-MM-DD format', () => {
      const date = '1776-07-04';

      const user = User.build({ birthdate: date });

      expect(user.toJSON().birthdate).to.equal(date);
    });

    it('handles null birthdate', async () => {
      const user = await factory.create('user', { birthdate: null });

      await user.reload();

      expect(user.toJSON().birthdate).to.be.null;
    });
  });

  describe('e164PhoneNumber', () => {
    context('with phone number marked deleted', () => {
      it('returns only the phone number', async () => {
        const user = await factory.build('user', { phoneNumber: '+11234567899-deleted-123' });

        expect(user.e164PhoneNumber()).to.equal('+11234567899');
      });
    });

    context('with normal phone number', () => {
      it('returns the phone number', async () => {
        const user = await factory.build('user', { phoneNumber: '+11234567899' });

        expect(user.e164PhoneNumber()).to.equal('+11234567899');
      });
    });

    context('with undefined phone number', () => {
      it('returns an empty string', () => {
        const user = User.build();

        expect(user.e164PhoneNumber()).to.equal('');
      });
    });
  });

  describe('getOrCreateExternalId', () => {
    it('returns existing ulid without calling update', async () => {
      const ulid = 'b'.repeat(26);
      const user = await factory.create<User>('user', { userUlid: ulid });
      const updateStub = sandbox.stub(User.prototype, 'update');
      const externalId = await user.getOrCreateExternalId();
      expect(externalId).to.equal(ulid);
      expect(updateStub).to.not.be.called;
    });

    it('creates ulid if one does not exist', async () => {
      const user = await factory.create<User>('user');
      expect(user.userUlid).to.not.exist;
      const externalId = await user.getOrCreateExternalId();
      await user.reload();
      expect(externalId).to.equal(user.userUlid);
    });

    it('creates and returns same ulid on multiple calls', async () => {
      const user = await factory.create<User>('user');
      expect(user.userUlid).to.not.exist;
      const [externalIdfromCall1, externalIdFromCall2] = await Promise.all([
        user.getOrCreateExternalId(),
        user.getOrCreateExternalId(),
      ]);
      await user.reload();
      expect(externalIdfromCall1).to.equal(user.userUlid);
      expect(externalIdFromCall2).to.equal(user.userUlid);
    });
  });
});
