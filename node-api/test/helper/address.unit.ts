import { mapCountryCodeFromState } from '../../src/helper/address';
import { expect } from 'chai';

describe('mapCountryCodeFromState', () => {
  it('should return "US" as country code for state address', () => {
    const actualCountryCode = mapCountryCodeFromState('TX');
    expect(actualCountryCode).to.be.equal('US');
  });

  it('should return correct country code for US territory address', () => {
    const actualCountryCode = mapCountryCodeFromState('GU');
    expect(actualCountryCode).to.be.equal('GU');
  });

  it('should return default "US" country code when no state provided', () => {
    const actualCountryCode = mapCountryCodeFromState('');
    expect(actualCountryCode).to.be.equal('US');
  });
});
