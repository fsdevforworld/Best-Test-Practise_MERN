import { expect } from 'chai';
import { isResponseError, mapTransactionStatus } from '../../../src/domain/payment-provider';
import { PaymentProviderTransactionStatus } from '../../../src/typings';
import { ExternalTransactionStatus } from '@dave-inc/wire-typings';
import { InvalidParametersError } from '../../../src/lib/error';

describe('Payment Provider Gateway Helper', () => {
  describe('isResponseError', () => {
    it('should return true for a valid Response Error', () => {
      const err = {
        response: {
          error: {
            status: 404,
            text: 'Something does not exist',
            path: 'http://your-website.com/stuff',
          },
        },
      };

      expect(isResponseError(err)).to.be.true;
    });

    it('should return false when missing a response object', () => {
      const err = { something: 'not a valid key' };
      expect(isResponseError(err)).to.be.false;
    });

    it('should return false when missing an error object', () => {
      const err = {
        response: {
          something: 'not a valid key',
        },
      };

      expect(isResponseError(err)).to.be.false;
    });

    it('should return false when missing an error status', () => {
      const err = {
        response: {
          error: {
            text: 'Something does not exist',
            path: 'http://your-website.com/stuff',
          },
        },
      };

      expect(isResponseError(err)).to.be.false;
    });

    it('should return false when missing error text', () => {
      const err = {
        response: {
          error: {
            status: 404,
            path: 'http://your-website.com/stuff',
          },
        },
      };

      expect(isResponseError(err)).to.be.false;
    });

    it('should return false when missing an error path', () => {
      const err = {
        response: {
          error: {
            status: 404,
            text: 'Something does not exist',
          },
        },
      };

      expect(isResponseError(err)).to.be.false;
    });
  });

  describe('mapTransactionStatus', () => {
    const errorCases = [PaymentProviderTransactionStatus.InvalidRequest];

    errorCases.forEach(status =>
      it(`should return cancelled for error cases (${status})`, () => {
        const result = mapTransactionStatus(status);
        expect(result).to.equal(ExternalTransactionStatus.Canceled);
      }),
    );

    const unknownCases = [
      PaymentProviderTransactionStatus.NotFound,
      PaymentProviderTransactionStatus.NetworkError,
    ];

    unknownCases.forEach(status =>
      it(`should throw for unknown cases (${status})`, () => {
        expect(() => mapTransactionStatus(status)).to.throw(InvalidParametersError);
      }),
    );
  });
});
