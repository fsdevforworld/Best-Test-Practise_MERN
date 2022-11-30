import { AddressFields, VerifyAddressResponse } from '@dave-inc/wire-typings';
import USPS from 'usps-webtools-promise';
import * as config from 'config';
import { USPSResponseError, UnprocessableEntityError } from './error';
import { UnprocessableEntityKey, USPSErrorKey } from '../translations';
import logger from './logger';
import { dogstatsd } from './datadog-statsd';
import { validateAddress } from './address-verification';
import { Address } from '../typings/user';
import { AddressValidateResponse } from 'usps-webtools-promise/dist/address-validate';
import { isDevEnv } from './utils';

// H means no unit and S means unit is invalid
const FOOTNOTE_UNIT_NUMBER_ERROR_REGEX = /H|S/;
const FOOTNOTE_MISSING_UNIT_NUMBER = 'H';

export const USPSConfig = {
  userId: () => {
    return config.get<string>('usps.userId');
  },
};

export class USPSAddressInvalidResponse {
  public message: string | undefined;

  constructor(message: string | undefined) {
    this.message = message;
  }
}

const uspsImpl = new USPS({
  userId: USPSConfig.userId(),
  properCase: true,
});

export type WrappedUSPSAddressValidateResponse = AddressValidateResponse & {
  '0'?: any; // TODO: delete this if the datadog stat `address_verification.usps.error` is 0
};

export const FieldMessages = {
  useResidentialAddress: 'Please use residential address',
  addApartmentNumber: 'Add apartment number',
};

type RequiredUSPSAddressFields = {
  Address1: string;
  Address2?: string;
  City: string;
  State: string;
  Zip5: string;
};

export const USPSApi = {
  /**
   * Unfortunately the usps-webtools-promise has incorrect type definitions and bizarre API behavior
   * As of v3.1.3, usps.verify actually returns a Promise<AddressValidateResponse | Error>
   * Errors are returned by the API when there is a error in the makeRequest function, indicating
   * a problem during the HTTP call or XML deserialization.
   * Errors are thrown by the API when there is an ErrorResponse object in the XML, even though
   * the ErrorResponse object is potentially present in AddressValidateResponse.
   */
  verifyAddress: async (api: USPS, uspsAddress: RequiredUSPSAddressFields) => {
    if (isDevEnv()) {
      return uspsAddress;
    }
    const verifyCall = (address: RequiredUSPSAddressFields) =>
      api.verify(address) as Promise<WrappedUSPSAddressValidateResponse | Error>;
    let response;
    try {
      response = await verifyCall(uspsAddress);
    } catch (error) {
      return new USPSAddressInvalidResponse(error.message);
    }
    if (response instanceof Error) {
      dogstatsd.increment('address_verification.usps.api_failure');
      logger.error('Failed to successfully call USPS to verify address: ', { error: response });
      throw new USPSResponseError(USPSErrorKey.USPSVerifyAddress, {
        failingService: 'usps',
        gatewayService: 'node-api',
      });
    }
    return response;
  },
};

export const USPSApiHelpers = {
  validateUSPSResponse: (
    response: WrappedUSPSAddressValidateResponse | USPSAddressInvalidResponse,
  ) => {
    if (response instanceof USPSAddressInvalidResponse) {
      dogstatsd.increment('address_verification.usps.address_invalid_response');
      throw new UnprocessableEntityError(UnprocessableEntityKey.InvalidAddress);
    }

    if (response.Error) {
      dogstatsd.increment('address_verification.usps.contains_error');
      throw new UnprocessableEntityError(UnprocessableEntityKey.InvalidAddress);
    }

    if (response[0]) {
      dogstatsd.increment('address_verification.usps.error');
      throw new UnprocessableEntityError(UnprocessableEntityKey.InvalidAddress);
    }

    if (response.Business === 'Y') {
      dogstatsd.increment('address_verification.usps.commercial_address');
      throw new UnprocessableEntityError(UnprocessableEntityKey.InvalidAddressIsCommercial, {
        data: {
          fieldMessage: FieldMessages.useResidentialAddress,
          field: AddressFields.ADDRESS_LINE_1,
        },
      });
    }

    // H means no unit and S means unit is invalid
    if (response.Footnotes?.match(FOOTNOTE_UNIT_NUMBER_ERROR_REGEX)) {
      const { Footnotes } = response;
      const message =
        Footnotes === FOOTNOTE_MISSING_UNIT_NUMBER
          ? UnprocessableEntityKey.InvalidAddressMissingUnit
          : UnprocessableEntityKey.InvalidAddressInvalidUnit;
      dogstatsd.increment('address_verification.usps.unit_error', { footnotes: Footnotes });
      throw new UnprocessableEntityError(message, {
        data: {
          fieldMessage: FieldMessages.addApartmentNumber,
          field: AddressFields.ADDRESS_LINE_2,
        },
      });
    }

    const required: RequiredUSPSAddressFields | null =
      response.Address1 && response.City && response.State && response.Zip5
        ? {
            Address1: response.Address1,
            Address2: response.Address2,
            City: response.City,
            State: response.State,
            Zip5: response.Zip5,
          }
        : null;
    if (!required) {
      dogstatsd.increment('address_verification.usps.missing_required_fields');
      throw new UnprocessableEntityError(UnprocessableEntityKey.InvalidAddress);
    }
    return required;
  },
};

export async function verifyAddress(address: Address): Promise<VerifyAddressResponse> {
  validateAddress(address);

  const uspsAddress: RequiredUSPSAddressFields = {
    Address1: address.addressLine1,
    Address2: address.addressLine2,
    City: address.city,
    State: address.state,
    Zip5: address.zipCode,
  };
  const response = await USPSApi.verifyAddress(uspsImpl, uspsAddress);

  const validated = USPSApiHelpers.validateUSPSResponse(response);
  dogstatsd.increment('address_verification.success');

  const isMatch =
    address.addressLine1 === validated.Address1 &&
    (address.addressLine2 === validated.Address2 ||
      (address.addressLine2 === '' && !validated.Address2)) &&
    address.city === validated.City &&
    address.state === validated.State &&
    address.zipCode === validated.Zip5;

  return {
    addressLine1: validated.Address1,
    addressLine2: validated.Address2 || '',
    city: validated.City,
    state: validated.State,
    zipCode: validated.Zip5,
    isMatch,
  };
}
