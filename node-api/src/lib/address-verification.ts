import * as request from 'superagent';
import { get } from 'lodash';
import {
  Address,
  AddressVerification,
  ISuperAgentAgent,
  SynapsepayDeliverabilityStatus,
} from '../typings';
import { mapCountryCodeFromState } from '../helper/address';
import * as config from 'config';
import { dogstatsd } from './datadog-statsd';
import logger from './logger';
import { SynapsePayError, UnprocessableEntityError } from './error';
import { AddressFields } from '@dave-inc/wire-typings';
import { FieldMessages } from './usps';

export type SynapsepayAddressVerification = {
  deliverability: SynapsepayDeliverabilityStatus;
  deliverability_analysis: {
    partial_valid: boolean;
    primary_number_invalid: boolean;
    primary_number_missing: boolean;
    secondary_invalid: boolean;
    secondary_missing: boolean;
  };
  normalized_address: {
    address_street: string;
    address_city: string;
    address_subdivision: string;
    address_postal_code: string;
    address_country_code: string;
  };
};

export const agent: ISuperAgentAgent<request.SuperAgentRequest> = request.agent();
const baseUrl: string = config.get('synapsepay.hostUrl');

export async function makeVerifyAddressRequest(
  address: Address,
): Promise<SynapsepayAddressVerification> {
  const { addressLine1, addressLine2, city, state, zipCode } = address;
  const payload = {
    address_street: addressLine2 ? `${addressLine1} ${addressLine2}` : addressLine1,
    address_city: city,
    address_subdivision: state,
    address_country_code: mapCountryCodeFromState(state),
    address_postal_code: zipCode,
  };

  try {
    const res = await agent.post(`${baseUrl}/v3.1/address-verification`).send(payload);
    return res.body;
  } catch (err) {
    logger.error('Error verifying address', { err });
    throw new SynapsePayError('Failed to verify address', {
      failingService: 'synapse-pay',
      gatewayService: 'node-api',
    });
  }
}

export function isAddressComplete(address: Address): boolean {
  const { addressLine1, city, state, zipCode } = address;
  return Boolean(addressLine1 && city && state && zipCode);
}

export async function verifyAddress(address: Address): Promise<AddressVerification> {
  const res: SynapsepayAddressVerification = await makeVerifyAddressRequest(address);
  if (
    res.deliverability === SynapsepayDeliverabilityStatus.GoogleUndeliverable ||
    res.deliverability === SynapsepayDeliverabilityStatus.Error
  ) {
    const errorMsg = setDeliveryErrorMsg(res.deliverability_analysis, res.normalized_address);
    return {
      errorMsg,
      originalAddress: address,
    };
  } else {
    return {
      originalAddress: address,
      normalizedAddress: {
        street: res.normalized_address.address_street,
        city: res.normalized_address.address_city,
        state: res.normalized_address.address_subdivision,
        zipCode: res.normalized_address.address_postal_code,
        countryCode: res.normalized_address.address_country_code,
      },
    };
  }
}

function setDeliveryErrorMsg(
  deliveryAnalysis: { [key: string]: boolean },
  address: { [key: string]: string },
) {
  if (get(deliveryAnalysis, 'primary_number_invalid')) {
    return 'Your primary address number is invalid. Please enter a valid number and try again.';
  }
  if (get(deliveryAnalysis, 'primary_number_missing')) {
    return 'Your primary address number is missing. Please enter a valid number and try again.';
  }
  if (get(deliveryAnalysis, 'secondary_invalid')) {
    dogstatsd.increment('address_verification.error.secondary_invalid');
    logger.info('addressVerificationError', { deliveryAnalysis, address });
    return 'Your secondary address line is invalid or unnecessary. Please update and try again.';
  }
  if (get(deliveryAnalysis, 'secondary_missing')) {
    dogstatsd.increment('address_verification.error.secondary_missing');
    logger.info('addressVerificationError', { deliveryAnalysis, address });
    return 'Your secondary address line is missing. Please add the secondary address and try again.';
  }
  return 'Undeliverable address. Please enter the full address and try again.';
}

export function validateAddressForBankingUser({
  addressLine1,
  addressLine2,
  city,
}: {
  addressLine1: string;
  addressLine2?: string | null;
  city: string;
}): { errorMessage?: string } {
  // these are based on Galileo's address rules.  if the address does not conform, this will fail to update their bank address
  // and will cause issues when mailing cards, etc.
  const isPoBox = isPOBox(addressLine1) || isPOBox(addressLine2);

  if (isPoBox) {
    return {
      errorMessage: 'The address cannot be a P.O. Box.',
    };
  }

  if (addressLine1.length > 40) {
    return {
      errorMessage: 'Address line 1 must be 40 characters or less.',
    };
  }

  if (addressLine2 && addressLine2.length > 30) {
    return {
      errorMessage: 'Address line 2 must be 30 characters or less.',
    };
  }

  if (city.length > 30) {
    return {
      errorMessage: 'City must be 30 characters or less.',
    };
  }

  return {};
}

export function validateAddress(address: Address): void {
  const { errorMessage } = validateAddressForBankingUser(address);

  const isPoBox = isPOBox(address.addressLine1) || isPOBox(address.addressLine2);

  if (errorMessage && isPoBox) {
    dogstatsd.increment('address_verification.invalid_address_for_banking.po_box');
    throw new UnprocessableEntityError(errorMessage, {
      data: {
        fieldMessage: FieldMessages.useResidentialAddress,
        field: AddressFields.ADDRESS_LINE_1,
      },
    });
  } else if (errorMessage) {
    dogstatsd.increment('address_verification.invalid_address_for_banking.address_field_too_long');
    throw new UnprocessableEntityError(errorMessage);
  }
}

// this regex was copied from the mobile code
export function isPOBox(street: string) {
  if (!street) {
    return false;
  }
  const poBox = /^\s*(.*((p|post)[-.\s]*(o|off|office)[-.\s]*(b|box|bin)[-.\s]*)|.*((p|post)[-.\s]*(o|off|office)[-.\s]*)|.*((p|post)[-.\s]*(b|box|bin)[-.\s]*)|(box|bin)[-.\s]*)(#|n|num|number)?\s*\d+/i;
  return poBox.test(street);
}
