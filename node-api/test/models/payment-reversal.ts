import { expect } from 'chai';
import factory from '../factories';
import { clean } from '../test-helpers';
import { ReversalStatus } from '../../src/typings';
import { PaymentReversal } from '../../src/models';

describe('Model: Payment Reversal', () => {
  before(() => clean());
  afterEach(() => clean());

  describe('@Scopes', () => {
    context('posted', () => {
      it('DOES return Completed payment reversal', async () => {
        const status = ReversalStatus.Completed;
        const reversal = await factory.create('payment-reversal', { status });
        const paymentReversals = await PaymentReversal.scope('posted').findAll();
        expect(paymentReversals[0].id).to.be.equal(reversal.id);
      });
      it('does NOT return Failed payment reversal', async () => {
        const status = ReversalStatus.Failed;
        await factory.create('payment-reversal', { status });
        const paymentReversals = await PaymentReversal.scope('posted').findAll();
        expect(paymentReversals.length).to.be.equal(0);
      });
      it('DOES return Pending payment reversal', async () => {
        const status = ReversalStatus.Pending;
        const reversal = await factory.create('payment-reversal', { status });
        const paymentReversals = await PaymentReversal.scope('posted').findAll();
        expect(paymentReversals[0].id).to.be.equal(reversal.id);
      });
    });
  });
});
