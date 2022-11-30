import { expect } from 'chai';
import * as request from 'supertest';
import { clean } from '../../test-helpers';
import factory from '../../factories';
import * as sinon from 'sinon';

import {
  Advance,
  AdvanceCollectionAttempt,
  AdvanceTip,
  BankTransaction,
  Payment,
} from '../../../src/models';

import { AdvanceDelivery, ExternalTransactionStatus } from '@dave-inc/wire-typings';
import { AdvanceCollectionTrigger } from '../../../src/typings';
import * as ActiveCollection from '../../../src/domain/active-collection';

import app, { BASE_SERVICE_PATH } from '../../../src/services/aether';

describe('Aether Get Advance API Endpoint', () => {
  const sandbox = sinon.createSandbox();
  let advance: Advance;
  let advanceId: number;

  before(() => clean());

  beforeEach(async () => {
    advance = await factory.create<Advance>('advance');
    advanceId = advance.id;
    await factory.create<AdvanceTip>('advance-tip', { advanceId, amount: 0 });
  });

  afterEach(() => sandbox.restore());

  it("should return an advance's disbursement status", async () => {
    const response = await request(app).get(`${BASE_SERVICE_PATH}/advance/${advance.id}`);

    expect(response.status).to.equal(200);
    expect(response.body.advance.disbursementStatus).to.equal(advance.disbursementStatus);
  });

  it('should indicate if an advance has a linked card', async () => {
    const nonLinked = await request(app).get(`${BASE_SERVICE_PATH}/advance/${advance.id}`);

    expect(nonLinked.status).to.equal(200);
    expect(nonLinked.body.advance.isLinkedCard).to.be.false;

    const linkedAdvance = await factory.create<Advance>('advance', {
      delivery: AdvanceDelivery.Express,
    });
    await factory.create<AdvanceTip>('advance-tip', { advanceId: linkedAdvance.id, amount: 0 });
    const bt = await factory.create<BankTransaction>('bank-transaction', {
      bankAccountId: linkedAdvance.bankAccountId,
      userId: linkedAdvance.userId,
    });
    await linkedAdvance.update({ disbursementBankTransactionId: bt.id });

    const linked = await request(app).get(`${BASE_SERVICE_PATH}/advance/${linkedAdvance.id}`);

    expect(linked.status).to.equal(200);
    expect(linked.body.advance.isLinkedCard).to.be.true;
  });

  it('should indicate whether an advance is currently being collected', async () => {
    await factory.create<AdvanceCollectionAttempt>('advance-collection-attempt', {
      advanceId,
      processing: true,
    });

    const response = await request(app).get(`${BASE_SERVICE_PATH}/advance/${advanceId}`);

    expect(response.status).to.equal(200);
    expect(response.body.advance.currentlyCollecting).to.equal(true);
  });

  it('does not lock advances without an active collection attempt', async () => {
    await factory.create<AdvanceCollectionAttempt>('advance-collection-attempt', {
      advanceId,
      processing: null,
    });

    const response = await request(app).get(`${BASE_SERVICE_PATH}/advance/${advanceId}`);

    expect(response.status).to.equal(200);
    expect(response.body.advance.currentlyCollecting).to.equal(false);
  });

  it('should indicate whether an advance has too many non exempt payments', async () => {
    await factory.createMany<AdvanceCollectionAttempt>('successful-advance-collection-attempt', 4, {
      advanceId,
      trigger: AdvanceCollectionTrigger.DAILY_CRONJOB,
    });

    const response = await request(app).get(`${BASE_SERVICE_PATH}/advance/${advanceId}`);

    expect(response.status).to.equal(200);
    expect(response.body.advance.tooManyNonExemptPayments).to.equal(true);
  });

  it('should allow collection if there are fewer than four non-exempt payments', async () => {
    // three non-exempt payments
    await factory.createMany<AdvanceCollectionAttempt>('successful-advance-collection-attempt', 3, {
      advanceId,
      trigger: AdvanceCollectionTrigger.DAILY_CRONJOB,
    });

    // an exempt payment
    await factory.create<AdvanceCollectionAttempt>('successful-advance-collection-attempt', {
      advanceId,
      trigger: AdvanceCollectionTrigger.USER_WEB,
    });

    const response = await request(app).get(`${BASE_SERVICE_PATH}/advance/${advanceId}`);

    expect(response.status).to.equal(200);
    expect(response.body.advance.tooManyNonExemptPayments).to.equal(false);
  });

  it('should allow collection if there are fewer than four completed payments', async () => {
    // three non-exempt payments
    await factory.createMany<AdvanceCollectionAttempt>('successful-advance-collection-attempt', 3, {
      advanceId,
      trigger: AdvanceCollectionTrigger.DAILY_CRONJOB,
    });

    // an exempt payment
    const { paymentId } = await factory.create<AdvanceCollectionAttempt>(
      'successful-advance-collection-attempt',
      {
        advanceId,
        trigger: AdvanceCollectionTrigger.USER_WEB,
      },
    );

    await Payment.update(
      { status: ExternalTransactionStatus.Pending },
      { where: { id: paymentId } },
    );

    const response = await request(app).get(`${BASE_SERVICE_PATH}/advance/${advanceId}`);

    expect(response.status).to.equal(200);
    expect(response.body.advance.tooManyNonExemptPayments).to.equal(false);
  });

  it('should return if another collection is active', async () => {
    await factory.createMany<AdvanceCollectionAttempt>('successful-advance-collection-attempt', 3, {
      advanceId,
      trigger: AdvanceCollectionTrigger.DAILY_CRONJOB,
    });

    sandbox.stub(ActiveCollection, 'isActiveCollection').resolves(false);

    const response = await request(app).get(`${BASE_SERVICE_PATH}/advance/${advanceId}`);

    expect(response.status).to.equal(200);
    expect(response.body.advance.isActiveCollection).to.equal(false);
  });

  it('should return 404 if an id does not exist', async () => {
    const response = await request(app).get(`${BASE_SERVICE_PATH}/advance/42`);

    expect(response.status).to.equal(404);
  });
});
