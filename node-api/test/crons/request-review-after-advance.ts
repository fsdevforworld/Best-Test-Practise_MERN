import * as sinon from 'sinon';
import { expect } from 'chai';
import { moment } from '@dave-inc/time-lib';
import { sequelize } from '../../src/models';
import { Advance } from '../../src/models';
import * as analyticsClient from '../../src/services/analytics/client';
import {
  bankAccountFixture,
  bankConnectionFixture,
  institutionFixture,
  paymentMethodFixture,
  userFixture,
} from '../fixtures';
import { requestReviewAfterAdvance } from '../../src/crons/request-review-after-advance';
import { clean, stubBankTransactionClient, up } from '../test-helpers';

describe('Request Review After Advance', () => {
  const sandbox = sinon.createSandbox();

  const fixtures = [
    userFixture,
    institutionFixture,
    bankConnectionFixture,
    bankAccountFixture,
    paymentMethodFixture,
  ];

  before(() => clean());

  beforeEach(function() {
    this.analyticsStub = sandbox.stub(analyticsClient, 'track').resolves();
    stubBankTransactionClient(sandbox);
    return up(fixtures);
  });

  afterEach(() => clean(sandbox));

  it('sends an sms to users that made an express advance 12 to 36 hours ago', async function() {
    const advance = await createAdvance();
    await sequelize.query(
      `
      UPDATE
        advance
      SET
        created = ?
      WHERE
        id = ?
    `,
      {
        replacements: [
          moment()
            .subtract(20, 'hours')
            .format('YYYY-MM-DD HH:mm:ss'),
          advance.id,
        ],
      },
    );

    await requestReviewAfterAdvance();

    sinon.assert.calledWith(this.analyticsStub, {
      event: 'advance disburse completed',
      properties: { amount: 75 },
      userId: '3',
    });
  });

  it('does not send an sms to advances made in the last 12 hours', async function() {
    await createAdvance();

    await requestReviewAfterAdvance();

    sinon.assert.notCalled(this.analyticsStub);
  });

  it('does not send an sms to advances made longer than 36 hours ago', async function() {
    const advance = await createAdvance();
    await sequelize.query(
      `
      UPDATE
        advance
      SET
        created = ?
      WHERE
        id = ?
    `,
      {
        replacements: [
          moment()
            .subtract(100, 'hours')
            .format('YYYY-MM-DD HH:mm:ss'),
          advance.id,
        ],
      },
    );

    await requestReviewAfterAdvance();

    sinon.assert.notCalled(this.analyticsStub);
  });

  it('sends an sms to the user', async function() {
    const advance = await createAdvance();
    await sequelize.query(
      `
      UPDATE
        advance
      SET
        created = ?
      WHERE
        id = ?
    `,
      {
        replacements: [
          moment()
            .subtract(20, 'hours')
            .format('YYYY-MM-DD HH:mm:ss'),
          advance.id,
        ],
      },
    );

    await requestReviewAfterAdvance();
    await requestReviewAfterAdvance();

    // Braze will throttle message delivery, so code does not need to
    expect(this.analyticsStub).to.have.been.calledTwice;
  });
});

async function createAdvance(): Promise<Advance> {
  const advance = await Advance.create({
    userId: 3,
    bankAccountId: 2,
    paymentMethodId: 2,
    amount: 75,
    fee: 4.99,
    paybackDate: moment().add(2, 'weeks'),
    tipPercent: 0,
    tip: 0,
    delivery: 'express',
    outstanding: 79.99,
    disbursementStatus: 'COMPLETED',
  });
  const user = await advance.getUser();
  await user.update({ settings: { sms_notifications_enabled: true } });

  return advance;
}
