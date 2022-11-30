import { expect } from 'chai';
import { centsToDollars, dollarsToCents } from '../../../src/services/loomis-api/helper';

describe('Loomis Helper Methods', () => {
  describe('dollarsToCents', () => {
    it('handles an expected number', async () => {
      const dollars = 71.85;
      const cents = 7185;

      expect(dollarsToCents(dollars)).to.equal(cents);
    });

    it('handles an unexpected small number', async () => {
      const dollars = 0.85;
      const cents = 85;

      expect(dollarsToCents(dollars)).to.equal(cents);
    });

    it('handles a round number', async () => {
      const dollars = 25;
      const cents = 2500;

      expect(dollarsToCents(dollars)).to.equal(cents);
    });

    it('handles a number with too many decimals', async () => {
      const dollars = 25.151515;
      const cents = 2515;

      expect(dollarsToCents(dollars)).to.equal(cents);
    });
  });

  describe('centsToDollars', () => {
    it('handles an expected number', async () => {
      const dollars = 71.85;
      const cents = 7185;

      expect(centsToDollars(cents)).to.equal(dollars);
    });

    it('handles an unexpected small number', async () => {
      const dollars = 0.85;
      const cents = 85;

      expect(centsToDollars(cents)).to.equal(dollars);
    });

    it('handles a round number', async () => {
      const dollars = 25;
      const cents = 2500;

      expect(centsToDollars(cents)).to.equal(dollars);
    });
  });
});
