import { getSupportedPlaidLanguage } from '../../src/lib/plaid';
import { expect } from 'chai';

describe('Plaid', () => {
  describe('getSupportedPlaidLanguage', async () => {
    it('returns language if supported', () => {
      const testEN = getSupportedPlaidLanguage('en');
      const testES = getSupportedPlaidLanguage('es');
      const testFR = getSupportedPlaidLanguage('fr');
      const testNL = getSupportedPlaidLanguage('nl');

      expect(testEN).to.eq('en');
      expect(testES).to.eq('es');
      expect(testFR).to.eq('fr');
      expect(testNL).to.eq('nl');
    });

    it('returns en if not supported', () => {
      const language = getSupportedPlaidLanguage('zz');

      expect(language).to.eq('en');
    });

    it('returns handles locale passed as an array', () => {
      const supportedLanguage = getSupportedPlaidLanguage(['fr']);
      const nonSupportedLanguage = getSupportedPlaidLanguage(['zz']);

      expect(supportedLanguage).to.eq('fr');
      expect(nonSupportedLanguage).to.eq('en');
    });
  });
});
