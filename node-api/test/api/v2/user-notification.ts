import * as request from 'supertest';
import { expect } from 'chai';
import * as sinon from 'sinon';
import app from '../../../src/api';
import factory from '../../factories';
import { clean, up } from '../../test-helpers';
import * as analytics from '../../../src/services/analytics/client';
import { User, UserNotification } from '../../../src/models';

describe('GET /v2/user_notification', () => {
  const sandbox = sinon.createSandbox();
  before(() => clean());
  beforeEach(() => up());
  afterEach(() => clean(sandbox));

  it('should return all user_notification records', async () => {
    const user = await factory.create<User>('user', { email: 'allison+test@dave.com' });
    const autoAdvanceNotification = await UserNotification.create({
      userId: user.id,
      notificationId: 1,
      smsEnabled: 0,
      pushEnabled: 1,
    });
    const lowBalanceNotification = await UserNotification.create({
      userId: user.id,
      notificationId: 2,
    });

    const response = await request(app)
      .get('/v2/user_notification')
      .set('Authorization', user.id.toString())
      .set('X-Device-Id', user.id.toString())
      .expect(200);

    expect(response.body[0].userId).to.equal(user.id);
    expect(response.body[0].id).to.equal(autoAdvanceNotification.id);
    expect(response.body[0].notificationType).to.equal('AUTO_ADVANCE_APPROVAL');
    expect(response.body[0].pushEnabled).to.equal(autoAdvanceNotification.pushEnabled);
    expect(response.body[0].smsEnabled).to.equal(autoAdvanceNotification.smsEnabled);
    expect(response.body[0].emailEnabled).to.equal(false);

    expect(response.body[1].userId).to.equal(user.id);
    expect(response.body[1].id).to.equal(lowBalanceNotification.id);
    expect(response.body[1].notificationType).to.equal('LOW_BALANCE');
    expect(response.body[1].pushEnabled).to.equal(false);
    expect(response.body[1].smsEnabled).to.equal(false);
    expect(response.body[1].emailEnabled).to.equal(false);
  });
});

describe('PATCH /v2/user_notification/:id', () => {
  const sandbox = sinon.createSandbox();
  before(() => clean());
  beforeEach(() => up());
  afterEach(() => clean(sandbox));

  it('should update a user_notification record', async () => {
    const track = sandbox.stub(analytics, 'track').resolves();
    const userNotification = await factory.create('auto-approval-notification', {
      userId: 500,
      pushEnabled: false,
      smsEnabled: false,
    });

    const url = `/v2/user_notification/${userNotification.id}`;
    const updates = {
      pushEnabled: true,
      smsEnabled: true,
    };

    const result = await request(app)
      .patch(url)
      .set('Authorization', 'token-500')
      .set('X-Device-Id', 'id-500')
      .send(updates);

    expect(result.status).to.equal(200);
    expect(result.body.pushEnabled).to.equal(true);
    expect(result.body.smsEnabled).to.equal(true);
    expect(track).to.have.been.calledWith({
      userId: String(500),
      event: 'user notification updated',
      context: {
        traits: {
          push_enabled: ['AUTO_ADVANCE_APPROVAL'],
          sms_enabled: ['AUTO_ADVANCE_APPROVAL'],
          email_enabled: [],
        },
      },
    });
  });
});
