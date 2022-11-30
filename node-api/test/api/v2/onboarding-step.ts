import * as request from 'supertest';
import * as sinon from 'sinon';
import app from '../../../src/api';
import { OnboardingStep, UserSession } from '../../../src/models';
import factory from '../../factories';

import { expect } from 'chai';
import { clean, up } from '../../test-helpers';

describe('/v2/onboarding_step', () => {
  const sandbox = sinon.createSandbox();

  // clean everything before we start
  before(() => clean());

  // insert user and user_session data
  beforeEach(() => {
    return up();
  });

  //truncate user and user_session data
  afterEach(() => clean(sandbox));

  describe('GET /onboarding_step', () => {
    it('should get the onboarding steps for a user', async () => {
      const result = await request(app)
        .get('/v2/onboarding_step')
        .set('Authorization', 'token-1000')
        .set('X-Device-Id', 'id-1000');

      expect(result.status).to.equal(200);
      expect(result.body).to.be.an('array');
      expect(result.body.length).to.equal(1);
      expect(result.body[0]).to.equal('debit_card');
    });

    it('should get the unique onboarding steps for a user', async () => {
      await factory.create('onboarding-step', { userId: 1000 });
      await factory.create('onboarding-step', { userId: 1000 });
      await factory.create('onboarding-step', { userId: 1000 });

      const result = await request(app)
        .get('/v2/onboarding_step')
        .set('Authorization', 'token-1000')
        .set('X-Device-Id', 'id-1000');

      expect(result.status).to.equal(200);
      expect(result.body).to.be.an('array');
      expect(result.body.length).to.equal(2);
      expect(result.body[0]).to.equal('debit_card');
      expect(result.body[1]).to.equal('BiometricOnboarding');
    });
  });

  describe('POST /onboarding_step', () => {
    it('should fail gracefully if the required data is not sent', async () => {
      const result = await request(app)
        .post('/v2/onboarding_step')
        .set('Authorization', 'token-1000')
        .set('X-Device-Id', 'id-1000')
        .send({});

      expect(result.status).to.equal(400);
      expect(result.body).to.be.an('object');
      expect(result.body.message).to.match(/Required parameters/);
    });

    it('should create an onboarding step record for a user', async () => {
      const result = await request(app)
        .post('/v2/onboarding_step')
        .set('Authorization', 'token-1000')
        .set('X-Device-Id', 'id-1000')
        .send({ step: 'someStep' });

      expect(result.status).to.equal(200);
      expect(result.body).to.be.an('array');
      expect(result.body.length).to.equal(2);
      expect(result.body[0]).to.equal('debit_card');
      expect(result.body[1]).to.equal('someStep');
    });

    it('should not create an onboarding step record for a user if step already exists', async () => {
      const result = await request(app)
        .post('/v2/onboarding_step')
        .set('Authorization', 'token-1000')
        .set('X-Device-Id', 'id-1000')
        .send({ step: 'debit_card' });

      expect(result.status).to.equal(200);
      expect(result.body).to.be.an('array');
      expect(result.body.length).to.equal(1);
      expect(result.body[0]).to.equal('debit_card');
    });

    it('should not create an AddDebitCard onboarding step record if payment method does not exist', async () => {
      const userSession = await factory.create<UserSession>('user-session');

      const result = await request(app)
        .post('/v2/onboarding_step')
        .set('Authorization', userSession.token)
        .set('X-Device-Id', userSession.deviceId)
        .send({ step: 'SelectAccount' });

      expect(result.status).to.equal(200);
      expect(result.body[0]).to.equal('SelectAccount');
      expect(result.body).to.not.contain('AddDebitCard');
    });

    it('should create an AddDebitCard onboarding step record if payment method already exists', async () => {
      const userSession = await factory.create<UserSession>('user-session');
      const user = await userSession.getUser();
      const bankAccount = await factory.create('bank-account', {
        userId: user.id,
      });
      const paymentMethod = await factory.create('payment-method', {
        bankAccountId: bankAccount.id,
        userId: user.id,
      });

      await bankAccount.update({ defaultPaymentMethodId: paymentMethod.id });
      await user.update({ defaultBankAccountId: bankAccount.id });

      const result = await request(app)
        .post('/v2/onboarding_step')
        .set('Authorization', userSession.token)
        .set('X-Device-Id', userSession.deviceId)
        .send({ step: 'SelectAccount' });

      expect(result.status).to.equal(200);
      expect(result.body).to.contain('SelectAccount');
      expect(result.body).to.contain('AddDebitCard');
    });
  });

  describe('POST /delete_onboarding_steps', () => {
    it('should delete only provided onboarding steps', async () => {
      await OnboardingStep.create({ userId: 600, step: 'AddAccount' });
      await OnboardingStep.create({ userId: 600, step: 'DoStuff' });
      await OnboardingStep.create({ userId: 600, step: 'EatCheese' });
      const result = await request(app)
        .post('/v2/delete_onboarding_steps')
        .set('Authorization', 'token-600')
        .set('X-Device-Id', 'id-600')
        .send({ steps: ['DoStuff', 'EatCheese'] });
      expect(result.status).to.equal(200);
      expect(result.body).to.be.an('array');
      expect(result.body.length).to.equal(1);
      expect(result.body[0]).to.equal('AddAccount');
      const steps = await OnboardingStep.findAll({ where: { userId: 600 } });
      expect(steps.length).to.equal(1);
      expect(steps[0].step).to.equal('AddAccount');
    });
  });
});
