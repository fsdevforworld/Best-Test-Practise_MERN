import { expect } from 'chai';
import * as sinon from 'sinon';
import * as https from 'https';
import { AddressFields } from '@dave-inc/wire-typings';
import { clean, replayHttp } from '../test-helpers';
import { verifyAddress, FieldMessages, USPSApi } from '../../src/lib/usps';
import { UnprocessableEntityError, USPSResponseError } from '../../src/lib/error';
import { UnprocessableEntityKey, USPSErrorKey } from '../../src/translations';

describe('USPS verifyAddress should', () => {
  const sandbox = sinon.createSandbox();

  before(() => clean());
  afterEach(() => clean(sandbox));

  it('throw an USPSResponseError if the USPS API verify call throws an error during the HTTP call', async () => {
    const requestStub = sandbox.stub(https, 'request').throws(new Error('my bad'));

    const addressLine1 = '1265 S Cochran Ave';
    const city = 'Los Angeles';
    const state = 'CA';
    const zipCode = '90019';

    const address = {
      addressLine1,
      city,
      state,
      zipCode,
    };
    await expect(verifyAddress(address)).to.rejectedWith(
      USPSResponseError,
      USPSErrorKey.USPSVerifyAddress,
    );
    expect(requestStub.called).to.be.true;
  });

  context('when passing an any address', () => {
    it('should throw an UnprocessableEntityError if addressLine1 is more than 40 characters long', async () => {
      const verifyStub = sandbox.stub(USPSApi, 'verifyAddress').resolves();

      const addressLine1 = '817 N Euclid Ave'.repeat(41);
      const city = 'Pasadena';
      const state = 'CA';
      const zipCode = '91104';

      const address = {
        addressLine1,
        city,
        state,
        zipCode,
      };
      await expect(verifyAddress(address)).to.rejectedWith(
        UnprocessableEntityError,
        'Address line 1 must be 40 characters or less.',
      );
      expect(verifyStub.called).to.be.false;
    });

    it('should throw an UnprocessableEntityError if addressLine2 is more than 30 characters long', async () => {
      const verifyStub = sandbox.stub(USPSApi, 'verifyAddress').resolves();

      const addressLine1 = '817 N Euclid Ave';
      const addressLine2 = '#102'.repeat(31);
      const city = 'Pasadena';
      const state = 'CA';
      const zipCode = '91104';

      const address = {
        addressLine1,
        addressLine2,
        city,
        state,
        zipCode,
      };
      await expect(verifyAddress(address)).to.rejectedWith(
        UnprocessableEntityError,
        'Address line 2 must be 30 characters or less.',
      );
      expect(verifyStub.called).to.be.false;
    });

    it('should throw an UnprocessableEntityError if city is more than 30 characters long', async () => {
      const verifyStub = sandbox.stub(USPSApi, 'verifyAddress').resolves();

      const addressLine1 = '817 N Euclid Ave';
      const city = 'Pasadena'.repeat(31);
      const state = 'CA';
      const zipCode = '91104';

      const address = {
        addressLine1,
        city,
        state,
        zipCode,
      };
      await expect(verifyAddress(address)).to.rejectedWith(
        UnprocessableEntityError,
        'City must be 30 characters or less.',
      );
      expect(verifyStub.called).to.be.false;
    });
  });

  context('when passing an address with po box', () => {
    it('should throw an UnprocessableEntityError with po box in line 1 before calling the USPS API', async () => {
      const verifyStub = sandbox.stub(USPSApi, 'verifyAddress').resolves();

      const addressLine1 = 'Po Box 2134';
      const city = 'Paramount';
      const state = 'CA';
      const zipCode = '90723';

      const address = {
        addressLine1,
        city,
        state,
        zipCode,
      };

      let isSuccess = false;
      try {
        await verifyAddress(address);
        isSuccess = true;
      } catch (error) {
        expect(error.statusCode).to.be.eq(422);
        expect(error.data.fieldMessage).to.be.eq(FieldMessages.useResidentialAddress);
        expect(error.data.field).to.be.eq(AddressFields.ADDRESS_LINE_1);
      }
      expect(verifyStub.called).to.be.false;
      expect(isSuccess).to.be.false;
    });

    it('should throw an UnprocessableEntityError with po box in line 2 before calling the USPS API', async () => {
      const verifyStub = sandbox.stub(USPSApi, 'verifyAddress').resolves();

      const addressLine1 = 'Something random';
      const addressLine2 = 'Po Box 2134';
      const city = 'Paramount';
      const state = 'CA';
      const zipCode = '90723';

      const address = {
        addressLine1,
        addressLine2,
        city,
        state,
        zipCode,
      };

      let isSuccess = false;
      try {
        await verifyAddress(address);
        isSuccess = true;
      } catch (error) {
        expect(error.statusCode).to.be.eq(422);
        expect(error.data.fieldMessage).to.be.eq(FieldMessages.useResidentialAddress);
        expect(error.data.field).to.be.eq(AddressFields.ADDRESS_LINE_1);
      }
      expect(verifyStub.called).to.be.false;
      expect(isSuccess).to.be.false;
    });
  });
});

describe('USPS API tests should', () => {
  describe('when verifyAddress is called', () => {
    context('and when passing an address without apartment number', () => {
      it(
        'should successfully verify address when no addressLine2 is passed',
        replayHttp('lib/usps/no-apt-number-success.json', async () => {
          const addressLine1 = '817 N Euclid Ave';
          const city = 'Pasadena';
          const state = 'CA';
          const zipCode = '91104';

          const address = {
            addressLine1,
            city,
            state,
            zipCode,
          };
          const validatedAddress = await verifyAddress(address);
          expect(validatedAddress.addressLine1).to.be.eq(addressLine1);
          expect(validatedAddress.addressLine2).to.be.eq('');
          expect(validatedAddress.city).to.be.eq(city);
          expect(validatedAddress.state).to.be.eq(state);
          expect(validatedAddress.zipCode).to.be.eq(zipCode);
          expect(validatedAddress.isMatch).to.be.true;
        }),
      );

      it(
        'should successfully verify address when empty string addressLine2 is passed',
        replayHttp('lib/usps/empty-string-apt-success.json', async () => {
          const addressLine1 = '817 N Euclid Ave';
          const addressLine2 = '';
          const city = 'Pasadena';
          const state = 'CA';
          const zipCode = '91104';

          const address = {
            addressLine1,
            addressLine2,
            city,
            state,
            zipCode,
          };
          const validatedAddress = await verifyAddress(address);
          expect(validatedAddress.addressLine1).to.be.eq(addressLine1);
          expect(validatedAddress.addressLine2).to.be.eq('');
          expect(validatedAddress.city).to.be.eq(city);
          expect(validatedAddress.state).to.be.eq(state);
          expect(validatedAddress.zipCode).to.be.eq(zipCode);
          expect(validatedAddress.isMatch).to.be.true;
        }),
      );

      it(
        'should autocorrect address if there is an invalid city but enough information is filled in',
        replayHttp('lib/usps/no-apt-number-autocorrect-city.json', async () => {
          const addressLine1 = '817 N Euclid Ave';
          const state = 'CA';
          const zipCode = '91104';

          const address = {
            addressLine1,
            city: 'Los Jeffrey',
            state,
            zipCode,
          };
          const validatedAddress = await verifyAddress(address);
          expect(validatedAddress.addressLine1).to.be.eq(addressLine1);
          expect(validatedAddress.city).to.be.eq('Pasadena');
          expect(validatedAddress.state).to.be.eq(state);
          expect(validatedAddress.zipCode).to.be.eq(zipCode);
          expect(validatedAddress.isMatch).to.be.false;
        }),
      );

      it(
        'should autocorrect address if there is an invalid state but enough information is filled in',
        replayHttp('lib/usps/no-apt-number-autocorrect-state.json', async () => {
          const addressLine1 = '817 N Euclid Ave';
          const city = 'Pasadena';
          const zipCode = '91104';

          const address = {
            addressLine1,
            city,
            state: 'LOL',
            zipCode,
          };
          const validatedAddress = await verifyAddress(address);
          expect(validatedAddress.addressLine1).to.be.eq(addressLine1);
          expect(validatedAddress.city).to.be.eq(city);
          expect(validatedAddress.state).to.be.eq('CA');
          expect(validatedAddress.zipCode).to.be.eq(zipCode);
          expect(validatedAddress.isMatch).to.be.false;
        }),
      );

      it(
        'should autocorrect address if there is an invalid zip but enough information is filled in',
        replayHttp('lib/usps/no-apt-number-autocorrect-zip.json', async () => {
          const addressLine1 = '817 N Euclid Ave';
          const city = 'Pasadena';
          const state = 'CA';

          const address = {
            addressLine1,
            city,
            state,
            zipCode: '99999',
          };
          const validatedAddress = await verifyAddress(address);
          expect(validatedAddress.addressLine1).to.be.eq(addressLine1);
          expect(validatedAddress.city).to.be.eq(city);
          expect(validatedAddress.state).to.be.eq(state);
          expect(validatedAddress.zipCode).to.be.eq('91104');
          expect(validatedAddress.isMatch).to.be.false;
        }),
      );

      it(
        'should format address properly by removing the period in avenue',
        replayHttp('lib/usps/no-apt-number-autocorrect-street.json', async () => {
          const city = 'Pasadena';
          const state = 'CA';
          const zipCode = '91104';

          const address = {
            addressLine1: '817 N Euclid Ave.',
            city,
            state,
            zipCode,
          };
          const validatedAddress = await verifyAddress(address);
          expect(validatedAddress.addressLine1).to.be.eq('817 N Euclid Ave');
          expect(validatedAddress.city).to.be.eq(city);
          expect(validatedAddress.state).to.be.eq(state);
          expect(validatedAddress.zipCode).to.be.eq(zipCode);
          expect(validatedAddress.isMatch).to.be.false;
        }),
      );

      it(
        'should throw an UnprocessableEntityError if there is no valid address information',
        replayHttp('lib/usps/no-apt-number-no-valid-address.json', async () => {
          const address = {
            addressLine1: 'something',
            addressLine2: 'something',
            city: 'something',
            state: 'something',
            zipCode: 'something',
          };
          await expect(verifyAddress(address)).to.rejectedWith(UnprocessableEntityError);
        }),
      );

      it(
        'should throw an UnprocessableEntityError if there is no street number in addressLine1',
        replayHttp('lib/usps/no-apt-number-no-street-number.json', async () => {
          const address = {
            addressLine1: 'N Euclid Ave',
            city: 'Pasadena',
            state: 'CA',
            zipCode: '91104',
          };
          await expect(verifyAddress(address)).to.rejectedWith(UnprocessableEntityError);
        }),
      );
    });

    context('and when passing a commercial address', () => {
      it(
        'should throw an UnprocessableEntityError because it is commercial address',
        replayHttp('lib/usps/commercial-address.json', async () => {
          const addressLine1 = '1265 S Cochran Ave';
          const city = 'Los Angeles';
          const state = 'CA';
          const zipCode = '90019';

          const address = {
            addressLine1,
            city,
            state,
            zipCode,
          };

          await expect(verifyAddress(address)).to.rejectedWith(
            UnprocessableEntityError,
            UnprocessableEntityKey.InvalidAddressIsCommercial,
          );
        }),
      );
    });

    context('and when passing an address with apartment number', () => {
      it(
        'should successfully verifies address with apartment number',
        replayHttp('lib/usps/has-apt-number-success.json', async () => {
          const addressLine1 = '411 S Virgil Ave';
          const addressLine2 = 'Apt 106';
          const city = 'Los Angeles';
          const state = 'CA';
          const zipCode = '90020';

          const address = {
            addressLine1,
            addressLine2,
            city,
            state,
            zipCode,
          };
          const validatedAddress = await verifyAddress(address);
          expect(validatedAddress.addressLine1).to.be.eq(addressLine1);
          expect(validatedAddress.addressLine2).to.be.eq(addressLine2);
          expect(validatedAddress.city).to.be.eq(city);
          expect(validatedAddress.state).to.be.eq(state);
          expect(validatedAddress.zipCode).to.be.eq(zipCode);
          expect(validatedAddress.isMatch).to.be.true;
        }),
      );

      it(
        'should successfully verifies address with apartment number and autocorrects',
        replayHttp('lib/usps/has-apt-number-autocorrects-apt.json', async () => {
          const addressLine1 = '411 S Virgil Ave';
          const addressLine2 = '#101';
          const city = 'Los Angeles';
          const state = 'CA';
          const zipCode = '90020';

          const address = {
            addressLine1,
            addressLine2,
            city,
            state,
            zipCode,
          };
          const validatedAddress = await verifyAddress(address);
          expect(validatedAddress.addressLine1).to.be.eq(addressLine1);
          expect(validatedAddress.addressLine2).to.be.eq('Apt 101');
          expect(validatedAddress.city).to.be.eq(city);
          expect(validatedAddress.state).to.be.eq(state);
          expect(validatedAddress.zipCode).to.be.eq(zipCode);
          expect(validatedAddress.isMatch).to.be.false;
        }),
      );

      it(
        'should throw an UnprocessableEntityError if the apt number is incorrect',
        replayHttp('lib/usps/has-apt-number-incorrect-apt-number.json', async () => {
          const addressLine1 = '411 S Virgil Ave';
          const addressLine2 = 'Apt 999';
          const city = 'Los Angeles';
          const state = 'CA';
          const zipCode = '90020';

          const address = {
            addressLine1,
            addressLine2,
            city,
            state,
            zipCode,
          };
          let isSuccess = false;
          try {
            await verifyAddress(address);
            isSuccess = true;
          } catch (error) {
            expect(error.statusCode).to.be.eq(422);
            expect(error.data.fieldMessage).to.be.eq('Add apartment number');
            expect(error.data.field).to.be.eq(AddressFields.ADDRESS_LINE_2);
          }
          expect(isSuccess).to.be.false;
        }),
      );

      it(
        'should throw an UnprocessableEntityError if no apt number is there',
        replayHttp('lib/usps/has-apt-number-missing-apt-number.json', async () => {
          const addressLine1 = '411 S Virgil Ave';
          const city = 'Los Angeles';
          const state = 'CA';
          const zipCode = '90020';

          const address = {
            addressLine1,
            city,
            state,
            zipCode,
          };
          let isSuccess = false;
          try {
            await verifyAddress(address);
            isSuccess = true;
          } catch (error) {
            expect(error.statusCode).to.be.eq(422);
            expect(error.data.fieldMessage).to.be.eq(FieldMessages.addApartmentNumber);
            expect(error.data.field).to.be.eq(AddressFields.ADDRESS_LINE_2);
          }
          expect(isSuccess).to.be.false;
        }),
      );
    });
  });
});
