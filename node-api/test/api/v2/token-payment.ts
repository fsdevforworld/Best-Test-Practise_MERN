import * as request from 'supertest';
import * as sinon from 'sinon';
import { expect } from 'chai';
import { clean } from '../../test-helpers';
import * as Tabapay from '../../../src/lib/tabapay';
import factory from '../../factories';
import { Payment } from '../../../src/models';
import app from '../../../src/api';
import { ExternalTransactionProcessor } from '@dave-inc/wire-typings';

describe('POST /v2/token_payment', () => {
  const sandbox = sinon.createSandbox();

  before(() => clean());

  afterEach(() => clean(sandbox));

  it('creates payment using a card token', async () => {
    const user = await factory.create('user', {
      firstName: 'John',
      lastName: 'Madden',
    });

    const advance = await factory.create('advance', {
      amount: 50,
      outstanding: 50,
      userId: user.id,
    });
    await factory.create('advance-tip', { advanceId: advance.id });

    const spy = sandbox.stub(Tabapay, 'retrieve').resolves({
      status: 'COMPLETED',
      id: 'blah',
    });

    const result = await request(app)
      .post('/v2/token_payment')
      .send({
        advanceId: advance.id,
        amount: 50,
        token: 'foo-bar',
      })
      .expect(201);

    sinon.assert.calledWith(
      spy,
      sinon.match.string,
      {
        card: { token: 'foo-bar' },
        owner: {
          name: {
            first: 'John',
            last: 'Madden',
          },
        },
      },
      50,
    );

    const payment = await Payment.findByPk(result.body.id);

    expect(payment.externalId).to.equal('blah');
    expect(payment.advanceId).to.equal(advance.id);
    expect(payment.bankAccountId).to.equal(null);
    expect(payment.paymentMethodId).to.equal(null);
    expect(payment.externalProcessor).to.equal(ExternalTransactionProcessor.Tabapay);
  });
});
