import { expect } from 'chai';
import { USPSApiHelpers, WrappedUSPSAddressValidateResponse } from '../../src/lib/usps';
import { UnprocessableEntityError } from '../../src/lib/error';
import { UnprocessableEntityKey } from '../../src/translations';

describe('USPSApiHelpers', () => {
  describe('validateUSPSResponse should', () => {
    it('now throw when required fields are present', () => {
      const required = {
        Address1: '1234 Banana St',
        City: 'Los Angeles',
        State: 'CA',
        Zip5: '96666',
      };
      const response = USPSApiHelpers.validateUSPSResponse(
        required as WrappedUSPSAddressValidateResponse,
      );
      expect(response.Address1).to.be.eq(required.Address1);
      expect(response.Address2).to.be.undefined;
      expect(response.City).to.be.eq(required.City);
      expect(response.State).to.be.eq(required.State);
      expect(response.Zip5).to.be.eq(required.Zip5);
    });

    it('now throw when required and optional fields are present', () => {
      const required = {
        Address1: '1234 Banana St',
        Address2: 'Apt 323',
        City: 'Los Angeles',
        State: 'CA',
        Zip5: '96666',
      };
      const response = USPSApiHelpers.validateUSPSResponse(
        required as WrappedUSPSAddressValidateResponse,
      );
      expect(response.Address1).to.be.eq(required.Address1);
      expect(response.Address2).to.be.eq(required.Address2);
      expect(response.City).to.be.eq(required.City);
      expect(response.State).to.be.eq(required.State);
      expect(response.Zip5).to.be.eq(required.Zip5);
    });

    it('throw an UnprocessableEntityError.InvalidAddress when the response is missing required address properties', () => {
      expect(() =>
        USPSApiHelpers.validateUSPSResponse({
          Address2: 'this is not real life',
        } as WrappedUSPSAddressValidateResponse),
      )
        .to.throw(UnprocessableEntityError)
        .satisfy(
          (err: { message: UnprocessableEntityKey }) =>
            err.message === UnprocessableEntityKey.InvalidAddress,
        );
    });

    it("throw an UnprocessableEntityError.InvalidAddress when the response has a '0' property, as this is previously expected behavior", () => {
      expect(() =>
        USPSApiHelpers.validateUSPSResponse({ 0: 'yyyyyy' } as WrappedUSPSAddressValidateResponse),
      )
        .to.throw(UnprocessableEntityError)
        .satisfy(
          (err: { message: UnprocessableEntityKey }) =>
            err.message === UnprocessableEntityKey.InvalidAddress,
        );
    });

    it('throw a UnprocessableEntityError.InvalidAddressIsCommercial when the response contains a business address', () => {
      expect(() =>
        USPSApiHelpers.validateUSPSResponse({
          Business: 'Y',
        } as WrappedUSPSAddressValidateResponse),
      )
        .to.throw(UnprocessableEntityError)
        .satisfy(
          (err: { message: UnprocessableEntityKey }) =>
            err.message === UnprocessableEntityKey.InvalidAddressIsCommercial,
        );
    });

    it('throw a UnprocessableEntityError with either a InvalidAddressMissingUnit or InvalidAddressInvalidUnit when the unit is invalid or missing', () => {
      expect(() =>
        USPSApiHelpers.validateUSPSResponse({
          Footnotes: 'H',
        } as WrappedUSPSAddressValidateResponse),
      )
        .to.throw(UnprocessableEntityError)
        .satisfy(
          (err: { message: UnprocessableEntityKey }) =>
            err.message === UnprocessableEntityKey.InvalidAddressMissingUnit,
        );
      expect(() =>
        USPSApiHelpers.validateUSPSResponse({
          Footnotes: 'S',
        } as WrappedUSPSAddressValidateResponse),
      )
        .to.throw(UnprocessableEntityError)
        .satisfy(
          (err: { message: UnprocessableEntityKey }) =>
            err.message === UnprocessableEntityKey.InvalidAddressInvalidUnit,
        );
    });
  });
});
