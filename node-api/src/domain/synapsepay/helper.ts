import { SynapsePayUserUpdateFields } from 'synapsepay';
import { MOMENT_FORMATS } from '@dave-inc/time-lib';
import { UserUpdateFields } from '../../typings';

export function mapToSynapseFields(fields: UserUpdateFields): SynapsePayUserUpdateFields {
  return {
    addressLine1: fields.addressLine1,
    addressLine2: fields.addressLine2,
    birthdate: fields.birthdate?.format(MOMENT_FORMATS.YEAR_MONTH_DAY),
    city: fields.city,
    state: fields.state,
    zipCode: fields.zipCode,
    firstName: fields.firstName,
    lastName: fields.lastName,
    license: fields.licenseFile,
  };
}
