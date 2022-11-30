import 'mocha';
import { expect } from 'chai';
import { getChargeFailureErrorTag, PAYMENT_CHARGE_ERRORS } from '../../src/lib/datadog-statsd';
import { InvalidParametersError } from '../../src/lib/error';

describe('datadog-statsd', () => {
  context('getChargeFailureErrorTag', () => {
    it('should correctly parse expected errors', () => {
      for (const chargeError of Object.values(PAYMENT_CHARGE_ERRORS)) {
        const error = new InvalidParametersError(chargeError);
        const result = getChargeFailureErrorTag(error);
        expect(result.charge_error).to.equal(chargeError);
      }
    });

    it('should correctly parse unexpected errors', () => {
      const error = new InvalidParametersError('Test');
      const result = getChargeFailureErrorTag(error);
      expect(result.charge_error).to.equal('unclassified error no metric');
    });
  });
});
