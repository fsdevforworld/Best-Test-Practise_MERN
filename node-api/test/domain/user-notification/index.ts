import { expect } from 'chai';
import * as sinon from 'sinon';
import factory from '../../factories';
import { clean } from '../../test-helpers';

import * as analytics from '../../../src/services/analytics/client';
import * as UserNotification from '../../../src/domain/user-notification';
import { Notification, UserNotification as Model } from '../../../src/models';

describe('User notification domain', () => {
  const sandbox = sinon.createSandbox();
  before(() => clean());
  afterEach(() => clean(sandbox));

  describe('broadcastPreferences', () => {
    it('should broadcast preferences', async () => {
      const track = sandbox.stub(analytics, 'track').resolves();

      const user = await factory.create('user');
      await factory.create('user-notification', {
        userId: user.id,
        notificationId: 1,
        emailEnabled: false,
        pushEnabled: true,
        smsEnabled: false,
      });
      await factory.create('user-notification', {
        userId: user.id,
        notificationId: 2,
        emailEnabled: true,
        pushEnabled: true,
        smsEnabled: false,
      });

      await UserNotification.broadcastPreferences(user.id);
      expect(track).to.have.been.calledWith({
        event: 'user notification updated',
        userId: String(user.id),
        context: {
          traits: {
            email_enabled: ['LOW_BALANCE'],
            push_enabled: ['AUTO_ADVANCE_APPROVAL', 'LOW_BALANCE'],
            sms_enabled: [],
          },
        },
      });
    });

    it('should broadcast empty preferences', async () => {
      const track = sandbox.stub(analytics, 'track').resolves();

      const user = await factory.create('user');
      await factory.create('user-notification', {
        userId: user.id,
        notificationId: 1,
        emailEnabled: false,
        pushEnabled: false,
        smsEnabled: false,
      });
      await factory.create('user-notification', {
        userId: user.id,
        notificationId: 2,
        emailEnabled: false,
        pushEnabled: false,
        smsEnabled: false,
      });

      await UserNotification.broadcastPreferences(user.id);
      expect(track).to.have.been.calledWith({
        event: 'user notification updated',
        userId: String(user.id),
        context: {
          traits: {
            email_enabled: [],
            push_enabled: [],
            sms_enabled: [],
          },
        },
      });
    });
  });

  describe('updateFromUserSettings', () => {
    it('creates user notifications - if non-existent for user', async () => {
      const track = sandbox.stub(analytics, 'track').resolves();
      const user = await factory.create('user');

      await UserNotification.updateFromUserSettings(user.id, {
        low_balance_alert: 30,
        push_notifications_enabled: false,
        sms_notifications_enabled: true,
      });

      const [notifications, results] = await Promise.all([
        Notification.findAll(),
        Model.findAll({ where: { userId: user.id } }),
      ]);

      expect(results.length).to.equal(notifications.length);
      expect(results[0].pushEnabled).to.equal(false);
      expect(results[1].pushEnabled).to.equal(false);
      expect(results[0].smsEnabled).to.equal(true);
      expect(results[1].smsEnabled).to.equal(true);

      expect(track).to.have.been.calledWith({
        event: 'user notification updated',
        userId: String(user.id),
        context: {
          traits: {
            push_enabled: [],
            sms_enabled: sinon.match.array.contains([
              'AUTO_ADVANCE_APPROVAL',
              'LOW_BALANCE',
              'SPECIAL_OFFERS',
              'PRODUCT_ANNOUNCEMENTS',
              'NEWSLETTER',
            ]),
            email_enabled: [],
          },
        },
      });
    });

    it('updates user notifications - if exists for user', async () => {
      const track = sandbox.stub(analytics, 'track').resolves();
      const off = { pushEnabled: false, smsEnabled: false, emailEnabled: false };

      const userNotification = await factory.create('user-notification', {
        ...off,
        notificationId: 1,
      });
      const userId = userNotification.userId;
      await factory.create('user-notification', { ...off, userId, notificationId: 2 });
      await factory.create('user-notification', { ...off, userId, notificationId: 3 });
      await factory.create('user-notification', { ...off, userId, notificationId: 4 });
      await factory.create('user-notification', { ...off, userId, notificationId: 5 });

      await UserNotification.updateFromUserSettings(userId, { push_notifications_enabled: true });

      const results = await Model.findAll({ where: { userId } });

      expect(results.find(un => un.notificationId === 1).pushEnabled).to.equal(false);
      expect(results.find(un => un.notificationId === 2).pushEnabled).to.equal(true);
      expect(track).to.have.been.calledWith({
        event: 'user notification updated',
        userId: String(userId),
        context: {
          traits: {
            push_enabled: sinon.match.array.contains(['LOW_BALANCE']),
            sms_enabled: [],
            email_enabled: [],
          },
        },
      });
    });

    it('sends sms marketing enabled signal', async () => {
      const track = sandbox.stub(analytics, 'track').resolves();
      const off = { pushEnabled: false, smsEnabled: false, emailEnabled: false };

      const un = await factory.create('user-notification', { ...off, notificationId: 1 });
      const userId = un.userId;
      await factory.create('user-notification', { ...off, userId, notificationId: 2 });
      await factory.create('user-notification', { ...off, userId, notificationId: 3 });
      await factory.create('user-notification', { ...off, userId, notificationId: 4 });
      await factory.create('user-notification', { ...off, userId, notificationId: 5 });

      await UserNotification.updateFromUserSettings(userId, { sms_notifications_enabled: true });

      expect(track.firstCall).to.have.been.calledWith({
        event: 'marketing sms enabled',
        userId: String(userId),
      });

      expect(track.secondCall).to.have.been.calledWith({
        event: 'user notification updated',
        userId: String(userId),
        context: {
          traits: {
            push_enabled: [],
            sms_enabled: ['LOW_BALANCE'],
            email_enabled: [],
          },
        },
      });
    });

    it('does not send sms marketing enabled signal if marketing sms already enabled', async () => {
      const track = sandbox.stub(analytics, 'track').resolves();
      const userNotification = await factory.create('user-notification', {
        notificationId: 3,
        smsEnabled: true,
        pushEnabled: false,
        emailEnabled: false,
      });

      const userId = userNotification.userId;

      const settings = {
        sms_notifications_enabled: true,
      };

      await UserNotification.updateFromUserSettings(userId, settings);

      expect(track.firstCall).to.have.been.calledWith({
        event: 'user notification updated',
        userId: String(userId),
        context: {
          traits: {
            push_enabled: [],
            sms_enabled: sinon.match.array.contains([
              'AUTO_ADVANCE_APPROVAL',
              'LOW_BALANCE',
              'SPECIAL_OFFERS',
              'PRODUCT_ANNOUNCEMENTS',
              'NEWSLETTER',
            ]),
            email_enabled: [],
          },
        },
      });
    });
  });

  describe('updateById', async () => {
    it('updates the user notification', async () => {
      const track = sandbox.stub(analytics, 'track').resolves();
      const notificationId = 1;
      const userNotification = await factory.create('user-notification', {
        notificationId,
        emailEnabled: false,
        pushEnabled: false,
        smsEnabled: false,
      });
      const userId = userNotification.userId;

      await UserNotification.updateById(userId, userNotification.id, { smsEnabled: true });

      const notification = await Model.findOne({ where: { userId, notificationId } });
      expect(notification.smsEnabled).to.be.true;
      expect(track).to.have.been.calledWith({
        event: 'user notification updated',
        userId: String(userId),
        context: {
          traits: {
            email_enabled: [],
            push_enabled: [],
            sms_enabled: ['AUTO_ADVANCE_APPROVAL'],
          },
        },
      });
    });

    it('broadcasts preferences and marketing sms enabled', async () => {
      const track = sandbox.stub(analytics, 'track').resolves();
      const notificationId = 3;
      const userNotification = await factory.create('user-notification', {
        notificationId,
        emailEnabled: false,
        pushEnabled: false,
        smsEnabled: false,
      });
      const userId = userNotification.userId;

      await UserNotification.updateById(userId, userNotification.id, { smsEnabled: true });
      const notification = await Model.findOne({ where: { userId, notificationId } });
      expect(notification.smsEnabled).to.be.true;

      expect(track.firstCall).to.have.been.calledWith({
        event: 'marketing sms enabled',
        userId: String(userId),
      });
      expect(track.secondCall).to.have.been.calledWith({
        event: 'user notification updated',
        userId: String(userId),
        context: {
          traits: {
            email_enabled: [],
            push_enabled: [],
            sms_enabled: ['SPECIAL_OFFERS'],
          },
        },
      });
    });

    it('does not broadcast marketing sms enabled for non marketing ids', async () => {
      const track = sandbox.stub(analytics, 'track').resolves();
      const notificationId = 2;
      const userNotification = await factory.create('user-notification', {
        notificationId,
        emailEnabled: false,
        pushEnabled: false,
        smsEnabled: false,
      });
      const userId = userNotification.userId;

      await UserNotification.updateById(userId, userNotification.id, { smsEnabled: true });
      const notification = await Model.findOne({ where: { userId, notificationId } });
      expect(notification.smsEnabled).to.be.true;

      expect(track.firstCall).to.have.been.calledWith({
        event: 'user notification updated',
        userId: String(userId),
        context: {
          traits: {
            email_enabled: [],
            push_enabled: [],
            sms_enabled: ['LOW_BALANCE'],
          },
        },
      });
    });

    it('does not broadcast marketing sms enabled if already enabled', async () => {
      const track = sandbox.stub(analytics, 'track').resolves();
      const notificationId = 3;
      const userNotification = await factory.create('user-notification', {
        notificationId,
        emailEnabled: false,
        pushEnabled: false,
        smsEnabled: true,
      });
      const userId = userNotification.userId;

      await UserNotification.updateById(userId, userNotification.id, { smsEnabled: true });
      const notification = await Model.findOne({ where: { userId, notificationId } });
      expect(notification.smsEnabled).to.be.true;

      expect(track.firstCall).to.have.been.calledWith({
        event: 'user notification updated',
        userId: String(userId),
        context: {
          traits: {
            email_enabled: [],
            push_enabled: [],
            sms_enabled: ['SPECIAL_OFFERS'],
          },
        },
      });
    });
  });
});
