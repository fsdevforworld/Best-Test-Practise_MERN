/**
 * Core.ts contains only things that reference external modules directly, so as to reduce circular dependencies.
 */

import {
  SynapsePayUserUpdateFields,
  CreateUserPayload,
  CreateBaseDocumentPayload,
} from 'synapsepay';
import { Assign } from 'utility-types';

import { mapCountryCodeFromState } from '../../helper/address';
import { User } from '../../models';

import { DocumentType } from './types';

export type SynapsePayUserDetails =
  | { id?: number; synapsepayId: string; legacyId?: number }
  | {
      id: number;
      firstName: string;
      lastName: string;
      phoneNumber: string;
      synapsepayId?: string;
      legacyId: number | null;
    };

export function mungeSynapsePayUserPayload(
  ip: string,
  user: User,
  fields: SynapsePayUserUpdateFields = {},
) {
  const phoneNumber = user.phoneNumber;
  const payload: Assign<
    Partial<CreateUserPayload>,
    {
      documents: Array<Partial<CreateBaseDocumentPayload>>;
    }
  > = {
    documents: [
      {
        ip,
        phone_number: phoneNumber,
        entity_type: 'NOT_KNOWN',
        entity_scope: 'Not Known',
        physical_docs: [],
      },
    ],
    phone_numbers: [phoneNumber],
    extra: {
      supp_id: user.id,
      cip_tag: 1,
    },
  };

  //TODO: Clean up CE-1195
  const emailOrPhone = (fields.email || user.email || phoneNumber).replace(/\s/g, '');
  payload.logins = [{ email: emailOrPhone }];
  payload.documents[0].email = emailOrPhone;

  if (fields.firstName && fields.lastName) {
    payload.legal_names = [`${fields.firstName} ${fields.lastName}`];
    payload.documents[0].name = `${fields.firstName} ${fields.lastName}`;
  }

  if (fields.birthdate) {
    const [year, month, day] = fields.birthdate.split('-').map(n => parseInt(n, 10));
    if (year !== undefined && month !== undefined && day !== undefined) {
      payload.documents[0].year = year;
      payload.documents[0].month = month;
      payload.documents[0].day = day;
    }
  }

  if (fields.addressLine1 && fields.city && fields.state && fields.zipCode) {
    payload.documents[0].address_street = fields.addressLine1;
    if (fields.addressLine2) {
      payload.documents[0].address_street = `${payload.documents[0].address_street} ${fields.addressLine2}`;
    }
    payload.documents[0].address_city = fields.city;
    payload.documents[0].address_subdivision = fields.state;
    payload.documents[0].address_postal_code = fields.zipCode;
    payload.documents[0].address_country_code = mapCountryCodeFromState(fields.state);
  }

  if (fields.ssn) {
    payload.documents[0].virtual_docs = [
      { document_value: fields.ssn, document_type: DocumentType.SSN },
    ];
  }

  if (fields.license) {
    payload.documents[0].physical_docs.push({
      document_value: `data:image/jpg;base64,${fields.license.buffer.toString('base64')}`,
      document_type: DocumentType.GOVT_ID,
    });
  }

  return payload;
}
