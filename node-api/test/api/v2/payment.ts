import { expect } from 'chai';
import * as sinon from 'sinon';
import * as request from 'supertest';
import app from '../../../src/api';
import * as SynapsepayModels from '../../../src/domain/synapsepay/external-model-definitions';
import SynapsepayNodeLib from '../../../src/domain/synapsepay/node';
import * as DebitCardCharge from '../../../src/domain/collection/charge-debit-card';
import * as ACH from '../../../src/domain/collection/ach';
import * as Outstanding from '../../../src/domain/collection/outstanding';
import {
  CUSTOM_ERROR_CODES,
  InvalidParametersError,
  PaymentError,
  PaymentProcessorError,
} from '../../../src/lib/error';
import { moment } from '@dave-inc/time-lib';
import sendgrid from '../../../src/lib/sendgrid';
import * as Tabapay from '../../../src/lib/tabapay';
import twilio from '../../../src/lib/twilio';
import {
  Advance,
  AdvanceCollectionAttempt,
  BankConnection,
  Payment,
  User,
} from '../../../src/models';
import factory from '../../factories';
import { clean, stubBalanceLogClient, stubLoomisClient, up } from '../../test-helpers';
import { ExternalTransactionProcessor } from '@dave-inc/wire-typings';
import * as Repayments from '../../../src/domain/repayment';
import { TivanResult } from '../../../src/lib/tivan-client';
import { AdvanceCollectionTrigger } from '../../../src/typings';
import { PaymentMethodType } from '@dave-inc/loomis-client';

describe('/v2/advance/:advanceId/payment', () => {
  const sandbox = sinon.createSandbox();

  before(() => clean());

  beforeEach(() => {
    sandbox.stub(twilio, 'send').resolves();
    sandbox.stub(sendgrid, 'send').resolves();
    stubLoomisClient(sandbox);
    stubBalanceLogClient(sandbox);
    return up();
  });

  afterEach(() => clean(sandbox));

  it('should fail if the amount is invalid', async () => {
    const result = await request(app)
      .post('/v2/advance/5/payment')
      .set('Authorization', 'token-5')
      .set('X-Device-Id', 'id-5')
      .send({ amount: 'foobar' });

    expect(result.status).to.equal(400);
    expect(result.body.message).to.match(/Payment amount must be positive/);
  });

  it('should fail if the advance id is not valid', async () => {
    const result = await request(app)
      .post('/v2/advance/foobar/payment')
      .set('Authorization', 'token-5')
      .set('X-Device-Id', 'id-5')
      .send({ amount: 20 });

    expect(result.status).to.equal(400);
    expect(result.body.message).to.match(/Advance not found/);
  });

  it('should fail if the amount is greater than the advance', async () => {
    const result = await request(app)
      .post('/v2/advance/3/payment')
      .set('Authorization', 'token-5')
      .set('X-Device-Id', 'id-5')
      .send({ amount: 80 });

    expect(result.status).to.equal(400);
    expect(result.body.message).to.match(/more than advance amount/);
  });

  it('should fail if the advance is less than 24 hours old', async () => {
    const result = await request(app)
      .post('/v2/advance/2/payment')
      .set('Authorization', 'token-5')
      .set('X-Device-Id', 'id-5')
      .send({ amount: 20 });

    expect(result.status).to.equal(400);
    expect(result.body.message).to.match(/within 24 hours of requesting/);
    expect(result.body.customCode).to.equal(CUSTOM_ERROR_CODES.PAYMENT_CANNOT_WITHIN_24_HOURS);
  });

  it('should fail ACH if the last payment was less than 3 days ago', async () => {
    sandbox.stub(DebitCardCharge, 'createDebitCardAdvanceCharge').returns(() => {
      throw new PaymentError('Unspecified error');
    });

    sandbox.stub(ACH, 'isInSameDayACHCollectionWindow').returns(true);

    const result = await request(app)
      .post('/v2/advance/4/payment')
      .set('Authorization', 'token-6')
      .set('X-Device-Id', 'id-6')
      .send({ amount: 20 });

    expect(result.status).to.equal(424);
    expect(result.body.message).to.match(/multiple payments within 72 hours/);
  });

  it('should fail if the transaction fails', async () => {
    sandbox.stub(ACH, 'isInSameDayACHCollectionWindow').returns(true);
    sandbox.stub(Tabapay, 'retrieve').rejects(new PaymentError('payment failed'));
    sandbox.stub(SynapsepayModels.helpers, 'getUserIP').returns({});
    sandbox.stub(SynapsepayModels.nodes, 'getAsync').resolves({});
    sandbox.stub(SynapsepayModels.users, 'getAsync').resolves({});
    sandbox.stub(SynapsepayModels.transactions, 'createAsync').resolves({
      json: {
        recent_status: { status: 'CANCELED' },
        _id: 1,
      },
    });
    const result = await request(app)
      .post('/v2/advance/3/payment')
      .set('Authorization', 'token-5')
      .set('X-Device-Id', 'id-5')
      .send({ amount: 20 });

    expect(result.status).to.equal(424);
    expect(result.body.message).to.match(/Failed to process transaction/);
  });

  it('should succeed if nothing else fails', async () => {
    sandbox.stub(Tabapay, 'retrieve').resolves({
      status: 'COMPLETED',
      id: 'foo-bar',
    });
    const result = await request(app)
      .post('/v2/advance/3/payment')
      .set('Authorization', 'token-5')
      .set('X-Device-Id', 'id-5')
      .send({ amount: 20 });

    expect(result.status).to.equal(200);
    expect(result.body.ok).to.equal(true);
    const payment = await Payment.findByPk(result.body.id);
    expect(payment.amount).to.equal(20);
    const advance = await Advance.findByPk(3);
    expect(advance.outstanding).to.equal(33.5);

    const collectionAttempt = await AdvanceCollectionAttempt.findOne({
      order: [['created', 'DESC']],
      where: { advanceId: payment.advanceId },
    });
    expect(collectionAttempt.trigger).to.equal('user');
  });

  it('should succeed even if there are four successful collection attempts', async () => {
    sandbox.stub(Tabapay, 'retrieve').resolves({
      status: 'COMPLETED',
      id: 'foo-bar',
    });

    await factory.createMany<AdvanceCollectionAttempt>('successful-advance-collection-attempt', 4, {
      advanceId: 3,
    });

    const result = await request(app)
      .post('/v2/advance/3/payment')
      .set('Authorization', 'token-5')
      .set('X-Device-Id', 'id-5')
      .send({ amount: 20 });

    expect(result.status).to.equal(200);
    expect(result.body.ok).to.equal(true);
    const payment = await Payment.findByPk(result.body.id);
    expect(payment.amount).to.equal(20);
    const advance = await Advance.findByPk(3);
    expect(advance.outstanding).to.equal(33.5);

    const collectionAttempt = await AdvanceCollectionAttempt.findOne({
      order: [['id', 'DESC']],
      where: { advanceId: payment.advanceId },
    });

    expect(collectionAttempt.trigger).to.equal('user');
  });

  it('should succeed as pending', async () => {
    const debitChargeStub = sandbox.stub(Tabapay, 'retrieve').resolves({
      status: 'COMPLETED',
      id: 'foo-bar',
    });

    const expectedAmount = 20;

    const result = await request(app)
      .post('/v2/advance/3/payment')
      .set('Authorization', 'token-5')
      .set('X-Device-Id', 'id-5')
      .send({ amount: expectedAmount });

    const isSubscription = false;
    sinon.assert.calledWith(
      debitChargeStub,
      sinon.match.string,
      sinon.match.string,
      expectedAmount,
      isSubscription,
    );
    expect(result.status).to.equal(200);
    expect(result.body.ok).to.equal(true);
    const payment = await Payment.findByPk(result.body.id);
    expect(payment.amount).to.equal(20);
    const advance = await Advance.findByPk(payment.advanceId);
    expect(advance.outstanding).to.equal(33.5);
  });

  it('does not allow another user to initiate payback', async () => {
    const advance = await factory.create('advance', {
      created: moment().subtract(5, 'days'),
    });

    const session = await factory.create('user-session');

    await request(app)
      .post(`/v2/advance/${advance.id}/payment`)
      .set('Authorization', session.token)
      .set('X-Device-Id', session.deviceId)
      .send({ amount: advance.outstanding, bankAccountId: advance.bankAccountId })
      .expect(400); // InvalidParametersError
  });

  it('should fail if the user does not have a sufficient bank account balance', async () => {
    const user = await factory.create('user');
    const bankConnection = await factory.create('bank-connection', { userId: user.id });
    const bankAccount = await factory.create('bank-account', {
      bankConnectionId: bankConnection.id,
      userId: user.id,
      available: 0,
      current: 0,
    });

    const paymentMethod = await factory.create('payment-method', {
      userId: user.id,
      bankAccountId: bankAccount.id,
    });

    await bankAccount.update({
      defaultPaymentMethodId: paymentMethod.id,
    });

    const advance = await factory.create('advance', {
      userId: user.id,
      bankAccountId: bankAccount.id,
      outstanding: 20,
      createdDate: moment()
        .subtract(5, 'days')
        .format('YYYY-MM-DD'),
      created: moment().subtract(5, 'days'),
    });

    await factory.create('advance-tip', { advanceId: advance.id, amount: 0 });

    await factory.create('user-session', {
      userId: user.id,
      token: `token-${user.id}`,
      deviceId: `id-${user.id}`,
    });

    const response = await request(app)
      .post(`/v2/advance/${advance.id}/payment`)
      .set('Authorization', `token-${user.id}`)
      .set('X-Device-Id', `id-${user.id}`)
      .send({ amount: 20, bankAccountId: bankAccount.id });

    // expect(response.status).to.equal(400);
    expect(response.body.message).to.include(
      'We could not find enough funds to make this payment from this bank account. Please try a smaller payment amount or try again later',
    );
  });

  it('uses the BankAccount(and associated defaultPaymentMethod) passed into the request when the bankConnection has been deleted', async () => {
    const advance = await Advance.findByPk(3);
    const user = await advance.getUser();
    const bankConnection = await factory.create('bank-connection', { userId: user.id });
    const paymentMethod = await factory.create('payment-method');
    const bankAccount = await factory.create('bank-account', {
      defaultPaymentMethodId: paymentMethod.id,
      bankConnectionId: bankConnection.id,
      userId: user.id,
      available: 100,
      current: 100,
    });

    const oldBankAccount = await advance.getBankAccount({ include: [BankConnection] });
    await oldBankAccount.bankConnection.destroy();

    const cardChargeStub = sandbox
      .stub(Tabapay, 'retrieve')
      .rejects(new PaymentProcessorError('Unspecified error', 'Something'));

    sandbox.stub(ACH, 'isInSameDayACHCollectionWindow').returns(true);

    const achStub = sandbox.stub(SynapsepayNodeLib, 'charge').resolves({
      status: 'PENDING',
      id: 'bar',
    });

    await request(app)
      .post('/v2/advance/3/payment')
      .set('Authorization', 'token-5')
      .set('X-Device-Id', 'id-5')
      .send({ amount: 20, bankAccountId: bankAccount.id });

    const isSubscription = false;
    sinon.assert.calledWith(
      cardChargeStub,
      sinon.match.any,
      paymentMethod.tabapayId,
      sinon.match.any,
      isSubscription,
      sinon.match.any,
    );
    sinon.assert.calledWith(
      achStub,
      sinon.match.has('id', user.id),
      sinon.match.has('id', bankAccount.id),
      sinon.match.any,
      sinon.match.any,
      sinon.match.any,
    );
  });

  it('uses the BankAccount(and associated defaultPaymentMethod) passed into the request when the bankAccount has been deleted', async () => {
    const advance = await Advance.findByPk(3);
    const user = await advance.getUser();
    const bankConnection = await factory.create('bank-connection', { userId: user.id });
    const paymentMethod = await factory.create('payment-method');
    const bankAccount = await factory.create('bank-account', {
      defaultPaymentMethodId: paymentMethod.id,
      bankConnectionId: bankConnection.id,
      userId: user.id,
      available: 100,
      current: 100,
    });

    const oldBankAccount = await advance.getBankAccount({ include: [BankConnection] });
    await oldBankAccount.destroy();

    const cardChargeStub = sandbox
      .stub(Tabapay, 'retrieve')
      .rejects(new PaymentProcessorError('Unspecified error', 'Something'));

    sandbox.stub(ACH, 'isInSameDayACHCollectionWindow').returns(true);

    const achStub = sandbox.stub(SynapsepayNodeLib, 'charge').resolves({
      status: 'PENDING',
      id: 'bar',
    });

    await request(app)
      .post('/v2/advance/3/payment')
      .set('Authorization', 'token-5')
      .set('X-Device-Id', 'id-5')
      .send({ amount: 20, bankAccountId: bankAccount.id });

    const isSubscription = false;
    sinon.assert.calledWith(
      cardChargeStub,
      sinon.match.any,
      paymentMethod.tabapayId,
      sinon.match.any,
      isSubscription,
      sinon.match.any,
    );
    sinon.assert.calledWith(
      achStub,
      sinon.match.has('id', user.id),
      sinon.match.has('id', bankAccount.id),
      sinon.match.any,
      sinon.match.any,
      sinon.match.any,
    );
  });
  context('when paying an advance with an encrypted one-time card', () => {
    let user: User;
    let advance: Advance;
    let tabapayRetrieveStub: sinon.SinonStub;

    beforeEach(async () => {
      user = await factory.create('user', {
        firstName: 'Baby',
        lastName: 'Spice',
      });

      const twoDaysAgo = moment().subtract(2, 'days');
      advance = await factory.create('advance', {
        amount: 50,
        created: twoDaysAgo,
        createdDate: twoDaysAgo.format('YYYY-MM-DD'),
        outstanding: 50,
        userId: user.id,
      });

      await factory.create('advance-tip', { advanceId: advance.id });

      tabapayRetrieveStub = sandbox.stub(Tabapay, 'retrieve').resolves({
        status: 'COMPLETED',
        id: 'merlin',
      });
    });

    it('should create a payment using an encrypted card', async () => {
      sandbox.stub(Tabapay, 'verifyCard').resolves();
      sandbox.stub(Outstanding, 'validateUserPaymentAmount').returns(true);
      const result = await request(app)
        .post(`/v2/advance/${advance.id}/payment`)
        .set('Authorization', user.id.toString())
        .set('X-Device-Id', user.id.toString())
        .send({
          amount: 50,
          oneTimeCard: {
            tabapayEncryptedCard: {
              encryptedCardData: 'size 14',
              keyId: 'roller skates',
            },
            firstName: 'hampster',
            lastName: 'dance',
            zipCode: '11111',
          },
        })
        .expect(200);

      const isSubscription = false;
      sinon.assert.calledWith(
        tabapayRetrieveStub,
        sinon.match.string,
        {
          card: {
            data: 'size 14',
            keyID: 'roller skates',
          },
          owner: {
            name: {
              first: 'hampster',
              last: 'dance',
            },
            address: {
              zipcode: '11111',
            },
          },
        },
        50,
        isSubscription,
      );

      const payment = await Payment.findByPk(result.body.id);

      expect(payment.externalId).to.equal('merlin');
      expect(payment.advanceId).to.equal(advance.id);
      expect(payment.bankAccountId).to.equal(null);
      expect(payment.paymentMethodId).to.equal(null);
      expect(payment.externalProcessor).to.equal(ExternalTransactionProcessor.Tabapay);

      const collectionAttempt = await AdvanceCollectionAttempt.findOne({
        order: [['created', 'DESC']],
        where: { advanceId: payment.advanceId },
      });
      expect(collectionAttempt.trigger).to.equal('user-one-time-card');
    });

    it('should fail if the one time card is supplied but is missing card parameters', async () => {
      const result = await request(app)
        .post(`/v2/advance/${advance.id}/payment`)
        .set('Authorization', user.id.toString())
        .set('X-Device-Id', user.id.toString())
        .send({
          amount: 20,
          oneTimeCard: {
            firstName: 'hampster',
            lastName: 'dance',
            zipCode: '11111',
          },
        });

      expect(result.status).to.equal(400);
      expect(result.body.message).to.match(
        /Required parameters not provided: tabapayEncryptedCard, firstName, lastName, zipCode/,
      );
    });

    it('should fail if the one time card is supplied but is missing owner parameters', async () => {
      const result = await request(app)
        .post(`/v2/advance/${advance.id}/payment`)
        .set('Authorization', user.id.toString())
        .set('X-Device-Id', user.id.toString())
        .send({
          amount: 20,
          oneTimeCard: {
            tabapayEncryptedCard: {
              encryptedCardData: 'size 14',
              keyId: 'roller skates',
            },
            lastName: 'dance',
            zipCode: '11111',
          },
        });

      expect(result.status).to.equal(400);
      expect(result.body.message).to.match(
        /Required parameters not provided: tabapayEncryptedCard, firstName, lastName, zipCode/,
      );
    });

    it('should fail if the one time card is not valid for payments', async () => {
      sandbox.stub(Tabapay, 'verifyCard').rejects(new InvalidParametersError('no good'));
      const result = await request(app)
        .post(`/v2/advance/${advance.id}/payment`)
        .set('Authorization', user.id.toString())
        .set('X-Device-Id', user.id.toString())
        .send({
          amount: 20,
          oneTimeCard: {
            tabapayEncryptedCard: {
              encryptedCardData: 'size 14',
              keyId: 'roller skates',
            },
            firstName: 'bowser',
            lastName: 'dance',
            zipCode: '11111',
          },
        });

      expect(result.status).to.equal(400);
      expect(result.body.message).to.match(/no good/);
    });
  });

  context('user payments with Tivan', () => {
    let createTaskStub: sinon.SinonStub;
    let waitForTaskStub: sinon.SinonStub;

    beforeEach(async () => {
      sandbox.stub(Repayments, 'shouldProcessUserPaymentWithTivan').resolves(true);
      createTaskStub = sandbox.stub(Repayments, 'createUserPaymentTask').resolves('task-id');
      waitForTaskStub = sandbox.stub(Repayments, 'waitForTaskResult');
    });

    afterEach(() => clean(sandbox));

    it('should return 200 on task success', async () => {
      waitForTaskStub.resolves({
        result: TivanResult.Success,
        successfulPayments: [{ taskPaymentResultId: 777 }],
      });

      const result = await request(app)
        .post('/v2/advance/3/payment')
        .set('Authorization', 'token-5')
        .set('X-Device-Id', 'id-5')
        .send({ amount: 20 })
        .expect(200);

      sandbox.assert.calledOnce(createTaskStub);
      const [advance, source, payment, amount] = createTaskStub.firstCall.args;
      expect(advance.id).to.equal(3);
      expect(source).to.equal(AdvanceCollectionTrigger.USER);
      expect(payment.type).to.equal(PaymentMethodType.DEBIT_CARD);
      expect(amount).to.equal(20);

      expect(result.body).to.deep.equal({ ok: true, id: 777 });
    });

    it('should return 200 for pending tasks', async () => {
      waitForTaskStub.resolves({
        result: TivanResult.Pending,
        successfulPayments: [{ taskPaymentResultId: 777 }],
      });

      await request(app)
        .post('/v2/advance/3/payment')
        .set('Authorization', 'token-5')
        .set('X-Device-Id', 'id-5')
        .send({ amount: 20 })
        .expect(200);
    });

    it('should return 200 on task success', async () => {
      const user = await factory.create('user');
      const session = await factory.create('user-session', { userId: user.id });
      const bankConnection = await factory.create('bank-of-dave-bank-connection', {
        userId: user.id,
      });
      const bankAccount = await factory.create('bank-account', {
        bankConnectionId: bankConnection.id,
        userId: user.id,
        available: 100,
        current: 100,
      });
      const advance = await factory.create('advance', {
        userId: user.id,
        bankAccountId: bankAccount.id,
        created: moment().subtract(5, 'days'),
      });

      await factory.create('advance-tip', { advanceId: advance.id, amount: 0 });

      waitForTaskStub.resolves({
        result: TivanResult.Success,
        successfulPayments: [{ taskPaymentResultId: 777 }],
      });

      await request(app)
        .post(`/v2/advance/${advance.id}/payment`)
        .set('Authorization', session.token)
        .set('X-Device-Id', session.deviceId)
        .send({ amount: 20 })
        .expect(200);
      sandbox.assert.calledOnce(createTaskStub);
      const payment = createTaskStub.firstCall.args[2];
      expect(payment.type).to.equal(PaymentMethodType.DAVE_BANKING);
      expect(payment.id).to.equal(bankAccount.id);
    });

    it('should return 424 for failed tasks', async () => {
      waitForTaskStub.resolves({ result: TivanResult.Failure });

      await request(app)
        .post('/v2/advance/3/payment')
        .set('Authorization', 'token-5')
        .set('X-Device-Id', 'id-5')
        .send({ amount: 20 })
        .expect(424);
    });

    it('should return error for unknown task status', async () => {
      waitForTaskStub.resolves(undefined);

      await request(app)
        .post('/v2/advance/3/payment')
        .set('Authorization', 'token-5')
        .set('X-Device-Id', 'id-5')
        .send({ amount: 20 })
        .expect(424);
    });

    it('should return 424 for an advance with 0 as its outstanding balance', async () => {
      const user = await factory.create('user');
      const advance = await factory.create('advance', {
        amount: 0,
        outstanding: 0,
        userId: user.id,
        created: moment().subtract(5, 'days'),
      });
      await factory.create('advance-tip', { advanceId: advance.id, amount: 0 });

      await factory.create('user-session', {
        userId: user.id,
        token: `token-${user.id}`,
        deviceId: `id-${user.id}`,
      });

      await request(app)
        .post(`/v2/advance/${advance.id}/payment`)
        .set('Authorization', `token-${user.id}`)
        .set('X-Device-Id', `id-${user.id}`)
        .send({ amount: 20 })
        .expect(424);
    });
  });
});
