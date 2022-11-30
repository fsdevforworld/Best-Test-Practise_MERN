import { expect } from 'chai';
import factory from '../factories';
import { clean } from '../test-helpers';
import * as sinon from 'sinon';

describe('AdvanceTip', () => {
  const sandbox = sinon.createSandbox();

  before(() => clean());
  afterEach(() => clean(sandbox));

  describe('modifications', () => {
    it('records modifications', async () => {
      const advance = await factory.create('advance');
      const oldValues = {
        amount: 10,
        percent: 10,
        advanceId: advance.id,
      };
      const newValues = {
        amount: 50,
        percent: 50,
      };
      const advanceTip = await factory.create('advance-tip', oldValues);

      await advanceTip.update(newValues);

      await advanceTip.reload();

      expect(advanceTip.modifications[0].current.amount).to.equal(newValues.amount);
      expect(advanceTip.modifications[0].current.percent).to.equal(newValues.percent);

      expect(advanceTip.modifications[0].previous.amount).to.equal(oldValues.amount);
      expect(advanceTip.modifications[0].previous.percent).to.equal(oldValues.percent);
    });

    it('only records fields that actually change their value', async () => {
      const advance = await factory.create('advance');
      const advanceTip = await factory.create('advance-tip', {
        amount: 20,
        percent: 10,
        advanceId: advance.id,
      });

      await advanceTip.update({ amount: 20, percent: 5 });
      await advanceTip.reload();

      expect(advanceTip.modifications[0].current.amount).to.equal(undefined);
    });

    it('includes metadata', async () => {
      const advance = await factory.create('advance');
      const advanceTip = await factory.create('advance-tip', { advanceId: advance.id });

      await advanceTip.update({ amount: 0 }, { metadata: { source: 'Jeff is the metadata' } });
      await advanceTip.reload();

      expect(advanceTip.modifications[0].metadata.source).to.equal('Jeff is the metadata');
    });
  });
});
