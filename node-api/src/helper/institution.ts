import plaidClient from '../lib/plaid';
import mxClient from '../lib/mx';
import { downloadImageAndBase64Encode } from '../lib/utils';
import { InstitutionWithInstitutionData } from 'plaid';

import { Institution } from '../models';

/**
 * Attempts to find an existing institution with a matching plaid institution ID
 * Otherwise, creates a new institution
 *
 * @param {string} plaidInstitutionId
 * @returns {Promise<Institution>}
 */
async function findOrCreatePlaidInstitution(plaidInstitutionId: string): Promise<Institution> {
  const existingInstitution = await Institution.findOne({ where: { plaidInstitutionId } });
  if (existingInstitution) {
    return existingInstitution;
  }

  const plaidResult = await plaidClient.getInstitutionById(plaidInstitutionId, {
    include_optional_metadata: true,
  });

  const plaidInstitution = plaidResult.institution as InstitutionWithInstitutionData;

  const primary = plaidInstitution.primary_color.replace(/rga/i, 'rgb'); // Sometimes plaid's color is RGA instead of RGB, I think typo
  const labels = plaidInstitution.credentials.reduce(
    (acc, cred) => {
      acc[cred.name] = cred.label;
      return acc;
    },
    { username: 'Username', password: 'Password' } as Record<string, string>,
  );

  return Institution.create({
    displayName: plaidInstitution.name,
    plaidInstitutionId,
    logo: plaidInstitution.logo,
    primaryColor: primary,
    usernameLabel: labels.username.slice(0, 32),
    passwordLabel: labels.password.slice(0, 32),
    pinLabel: labels.pin,
  });
}

/**
 * Attempts to find an existing institution with a matching mx institution code
 * Otherwise, creates a new institution
 *
 * @param {string} mxInstitutionCode
 * @param {string} mxUserGuid
 * @returns {Promise<Institution>}
 */
async function findOrCreateMxInstitution(
  mxInstitutionCode: string,
  mxUserGuid: string,
): Promise<Institution> {
  const existingInstitution = await Institution.findOne({
    where: { mxInstitutionCode },
  });
  if (existingInstitution) {
    return existingInstitution;
  }

  const { body: institutionResponseBody } = await mxClient.institutions.readInstitution(
    mxInstitutionCode,
  );

  const { code, name, mediumLogoUrl } = institutionResponseBody.institution;

  const base64EncodedLogo = await downloadImageAndBase64Encode(mediumLogoUrl);

  return Institution.create({
    displayName: name,
    mxInstitutionCode: code,
    logo: base64EncodedLogo,
    primaryColor: '#ffffff', // TODO - pick a fallback primary color for MX institutions
  });
}

export default {
  findOrCreatePlaidInstitution,
  findOrCreateMxInstitution,
};
