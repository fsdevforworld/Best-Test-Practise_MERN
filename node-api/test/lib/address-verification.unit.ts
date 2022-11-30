import { expect } from 'chai';
import { replayHttp } from '../test-helpers';
import { Address, AddressVerification } from '../../src/typings';
import {
  validateAddressForBankingUser,
  verifyAddress,
  makeVerifyAddressRequest,
  agent,
} from '../../src/lib/address-verification';
import { SynapsePayError } from '../../src/lib/error';
import * as sinon from 'sinon';

describe('addressVerification', () => {
  const sandbox = sinon.createSandbox();

  describe('verifyAddress', () => {
    it(
      'marks address as valid and returns a formatted address given a valid US territory address',
      replayHttp('helper/address-verification/valid-address-us-territory.json', async () => {
        const addressLine1 = '301 PR-26';
        const city = 'San Juan';
        const state = 'PR';
        const zipCode = '00918';
        const countryCode = 'PR';
        const verifiedAddress: AddressVerification = await verifyAddress({
          addressLine1,
          city,
          state,
          zipCode,
        });
        expect(verifiedAddress.normalizedAddress.street).to.equal(addressLine1);
        expect(verifiedAddress.normalizedAddress.city).to.equal(city);
        expect(verifiedAddress.normalizedAddress.state).to.equal(state);
        expect(verifiedAddress.normalizedAddress.zipCode).to.equal(zipCode);
        expect(verifiedAddress.normalizedAddress.countryCode).to.equal(countryCode);
        expect(verifiedAddress.originalAddress.addressLine1).to.equal(addressLine1);
        expect(verifiedAddress.originalAddress.addressLine2).to.be.undefined;
        expect(verifiedAddress.originalAddress.city).to.equal(city);
        expect(verifiedAddress.originalAddress.state).to.equal(state);
        expect(verifiedAddress.originalAddress.zipCode).to.equal(zipCode);
      }),
    );

    it(
      'marks address as valid and returns a formatted address given a valid US state address',
      replayHttp('helper/address-verification/valid-address.json', async () => {
        const addressLine1 = '1265 S Cochran Ave';
        const city = 'Los Angeles';
        const state = 'CA';
        const zipCode = '90019';
        const countryCode = 'US';
        const verifiedAddress: AddressVerification = await verifyAddress({
          addressLine1,
          city,
          state,
          zipCode,
        });
        expect(verifiedAddress.normalizedAddress.street).to.equal('1265 S COCHRAN AVE');
        expect(verifiedAddress.normalizedAddress.city).to.equal('LOS ANGELES');
        expect(verifiedAddress.normalizedAddress.state).to.equal('CA');
        expect(verifiedAddress.normalizedAddress.zipCode).to.equal('90019');
        expect(verifiedAddress.normalizedAddress.countryCode).to.equal(countryCode);
        expect(verifiedAddress.originalAddress.addressLine1).to.equal(addressLine1);
        expect(verifiedAddress.originalAddress.addressLine2).to.be.undefined;
        expect(verifiedAddress.originalAddress.city).to.equal(city);
        expect(verifiedAddress.originalAddress.state).to.equal(state);
        expect(verifiedAddress.originalAddress.zipCode).to.equal(zipCode);
      }),
    );

    it(
      'marks address as valid and returns a formatted address given a poorly formatted but valid address with typos',
      replayHttp('helper/address-verification/poorly-formatted-address.json', async () => {
        const addressLine1 = '1277 cOcRaN rD';
        const addressLine2 = 'uNIt 4';
        const city = 'LA';
        const state = 'cc';
        const zipCode = '90019';
        const countryCode = 'US';
        const verifiedAddress: AddressVerification = await verifyAddress({
          addressLine1,
          addressLine2,
          city,
          state,
          zipCode,
        });
        expect(verifiedAddress.normalizedAddress.street).to.equal('1277 S COCHRAN AVE UNIT 4');
        expect(verifiedAddress.normalizedAddress.city).to.equal('LOS ANGELES');
        expect(verifiedAddress.normalizedAddress.state).to.equal('CA');
        expect(verifiedAddress.normalizedAddress.zipCode).to.equal('90019');
        expect(verifiedAddress.normalizedAddress.countryCode).to.equal(countryCode);
        expect(verifiedAddress.originalAddress.addressLine1).to.equal(addressLine1);
        expect(verifiedAddress.originalAddress.addressLine2).to.equal(addressLine2);
        expect(verifiedAddress.originalAddress.city).to.equal(city);
        expect(verifiedAddress.originalAddress.state).to.equal(state);
        expect(verifiedAddress.originalAddress.zipCode).to.equal(zipCode);
      }),
    );

    it(
      'marks address as invalid and returns error message given primary number is missing',
      replayHttp('helper/address-verification/missing-primary.json', async () => {
        const addressLine1 = 'S Cochran Ave';
        const city = 'Los Angeles';
        const state = 'CA';
        const zipCode = '90019';
        const verifiedAddress: AddressVerification = await verifyAddress({
          addressLine1,
          city,
          state,
          zipCode,
        });
        expect(verifiedAddress.normalizedAddress).to.be.undefined;
        expect(verifiedAddress.errorMsg).to.match(
          /Your primary address number is missing. Please enter a valid number and try again./,
        );
        expect(verifiedAddress.originalAddress.addressLine1).to.equal(addressLine1);
        expect(verifiedAddress.originalAddress.addressLine2).to.be.undefined;
        expect(verifiedAddress.originalAddress.city).to.equal(city);
        expect(verifiedAddress.originalAddress.state).to.equal(state);
        expect(verifiedAddress.originalAddress.zipCode).to.equal(zipCode);
      }),
    );

    it(
      'marks address as invalid and returns error message given primary number is invalid',
      replayHttp('helper/address-verification/invalid-primary.json', async () => {
        const addressLine1 = '1265A S Cochran Ave';
        const city = 'Los Angeles';
        const state = 'CA';
        const zipCode = '90019';
        const verifiedAddress: AddressVerification = await verifyAddress({
          addressLine1,
          city,
          state,
          zipCode,
        });
        expect(verifiedAddress.normalizedAddress).to.be.undefined;
        expect(verifiedAddress.errorMsg).to.match(
          /Your primary address number is invalid. Please enter a valid number and try again./,
        );
        expect(verifiedAddress.originalAddress.addressLine1).to.equal(addressLine1);
        expect(verifiedAddress.originalAddress.addressLine2).to.be.undefined;
        expect(verifiedAddress.originalAddress.city).to.equal(city);
        expect(verifiedAddress.originalAddress.state).to.equal(state);
        expect(verifiedAddress.originalAddress.zipCode).to.equal(zipCode);
      }),
    );

    it(
      'marks address as invalid and given other invalid address',
      replayHttp('helper/address-verification/invalid-address.json', async () => {
        const addressLine1 = '1234567890 S Cochran Ave';
        const city = 'Los Angeles';
        const state = 'CA';
        const zipCode = '90019';
        const verifiedAddress: AddressVerification = await verifyAddress({
          addressLine1,
          city,
          state,
          zipCode,
        });
        expect(verifiedAddress.originalAddress.addressLine1).to.equal(addressLine1);
        expect(verifiedAddress.originalAddress.addressLine2).to.be.undefined;
        expect(verifiedAddress.originalAddress.city).to.equal(city);
        expect(verifiedAddress.originalAddress.state).to.equal(state);
        expect(verifiedAddress.originalAddress.zipCode).to.equal(zipCode);
        expect(verifiedAddress.normalizedAddress).to.be.undefined;
      }),
    );

    it('should throw a SynapsePayError if makeVerifyAddressRequest fails', async () => {
      const addressLine1 = '123 Drury Lane';
      const city = 'Los Angeles';
      const state = 'CA';
      const zipCode = '90019';

      sandbox.stub(agent, 'post').throws();

      await expect(
        makeVerifyAddressRequest({ addressLine1, city, state, zipCode }),
      ).to.be.rejectedWith(SynapsePayError, 'Failed to verify address');
    });
  });

  describe('validateAddressForBankingUser', () => {
    const baseAddress = {
      city: 'Los Angeles',
      state: 'CA',
      zipCode: '90291',
      addressLine1: '123 Main St',
      addressLine2: 'Number 7',
    };

    it('should allow a valid address', () => {
      expect(validateAddressForBankingUser(baseAddress)).to.eql({});
    });

    it('should allow an address without a second line', () => {
      const address: Address = {
        ...baseAddress,
        addressLine2: undefined,
      };

      expect(validateAddressForBankingUser(address)).to.eql({});
    });

    it('should not allow overly long addresses or cities', () => {
      const longCity: Address = {
        ...baseAddress,
        city: 'a'.repeat(41),
      };

      const longAddress1: Address = {
        ...baseAddress,
        addressLine1: 'a'.repeat(41),
      };

      const longAddress2: Address = {
        ...baseAddress,
        addressLine2: 'a'.repeat(31),
      };

      expect(validateAddressForBankingUser(longCity)).to.eql({
        errorMessage: 'City must be 30 characters or less.',
      });

      expect(validateAddressForBankingUser(longAddress1)).to.eql({
        errorMessage: 'Address line 1 must be 40 characters or less.',
      });

      expect(validateAddressForBankingUser(longAddress2)).to.eql({
        errorMessage: 'Address line 2 must be 30 characters or less.',
      });
    });

    it('should not allow a PO Box', () => {
      const address: Address = {
        ...baseAddress,
        addressLine1: 'PO Box #123',
      };

      expect(validateAddressForBankingUser(address)).to.eql({
        errorMessage: 'The address cannot be a P.O. Box.',
      });
    });

    it('should not allow a PO Box split across multiple lines', () => {
      const address: Address = {
        ...baseAddress,
        addressLine1: 'PO',
        addressLine2: 'Box #123',
      };

      expect(validateAddressForBankingUser(address)).to.eql({
        errorMessage: 'The address cannot be a P.O. Box.',
      });
    });
  });
});
