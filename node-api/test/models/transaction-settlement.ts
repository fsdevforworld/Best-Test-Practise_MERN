import factory from '../factories';
import { expect } from 'chai';
import { clean } from '../test-helpers';

describe('Model: TransactionSettlement', () => {
  before(() => clean());

  afterEach(() => clean());

  describe('modifications', () => {
    it('records fields that are updated', async () => {
      const tranSettlement = await factory.create('transaction-settlement', { amount: 20 });

      await tranSettlement.update({ amount: 25 });

      expect(tranSettlement.modifications[0].new.amount).to.equal(25);
      expect(tranSettlement.modifications[0].old.amount).to.equal(20);
    });

    it('will append modifications', async () => {
      const tranSettlement = await factory.create('transaction-settlement', { amount: 20 });

      await tranSettlement.update({ amount: 21 });

      await tranSettlement.update({ amount: 22 });

      expect(tranSettlement.modifications[0].new.amount).to.equal(21);
      expect(tranSettlement.modifications[1].new.amount).to.equal(22);
    });
  });
});
