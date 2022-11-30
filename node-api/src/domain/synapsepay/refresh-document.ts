import { DehydratedUser, DehydratedSubDocument, DehydratedBaseDocument } from 'synapsepay';
import { omitBy, isNil } from 'lodash';
import { NotFoundError } from '../../lib/error';
import { SynapsepayDocument } from '../../models';
import fetchUserFromSynapsepay from './fetch-user-from-synapsepay';

function extractSanctionsMatch(screeningResults: DehydratedBaseDocument['screening_results']) {
  return Object.values(screeningResults).includes('MATCH');
}

/**
 * This function is to support the enums we have for license_status and ssn_status in the
 * synapsepay_document table that do not fully support all of the possible statuses for a
 * subdocument. All future db status columns should support all possible subdocument statuses.
 */
function extractStatus(subDocument: DehydratedSubDocument | undefined): string | null {
  let status = null;
  if (subDocument) {
    status = subDocument.status.split('|').pop();
  }

  return status;
}

function serializeForDb(synpasepayUser: DehydratedUser, documentId: string) {
  const {
    documents,
    permission,
    permission_code: permissionCode,
    flag,
    flag_code: flagCode,
    watchlists,
    extra,
  } = synpasepayUser;

  const document = documents.find(doc => doc.id === documentId);

  if (!document) {
    throw new NotFoundError('Could not find matching document', {
      data: {
        documentId,
        availableIds: documents.map(d => d.id),
        synapsepayUserId: synpasepayUser._id,
      },
    });
  }

  return {
    addressCity: document.address_city,
    addressPostalCode: document.address_postal_code,
    addressStreet: document.address_street,
    addressSubdivision: document.address_subdivision,
    day: document.day,
    email: document.email,
    licenseStatus: extractStatus(
      document.physical_docs.find(subDoc => subDoc.document_type === 'GOVT_ID'),
    ),
    month: document.month,
    name: document.name,
    phoneNumber: document.phone_number,
    permission,
    permissionCode,
    ssnStatus: extractStatus(document.virtual_docs.find(subDoc => subDoc.document_type === 'SSN')),
    year: document.year,
    sanctionsScreeningMatch: extractSanctionsMatch(document.screening_results),
    idScore: document.id_score,
    flag,
    flagCode,
    watchlists,
    extra,
  };
}

export default async function refreshDocument(document: SynapsepayDocument): Promise<void> {
  const user = document.user || (await document.getUser({ paranoid: false }));

  const synapsepayUser = await fetchUserFromSynapsepay(user, {
    synapsepayUserId: document.synapsepayUserId,
  });

  const documentUpdates = serializeForDb(synapsepayUser.json, document.synapsepayDocId);
  const filteredUpdates = omitBy(documentUpdates, isNil);

  await document.update(filteredUpdates);
}
