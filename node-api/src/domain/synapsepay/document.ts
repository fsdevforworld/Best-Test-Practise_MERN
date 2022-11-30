import { find, omitBy, isNil, get } from 'lodash';
import {
  UserJSON,
  SynapsePayUserUpdateFields,
  UpdateUserPayload,
  DehydratedUser,
  CreateUserPayload,
  DehydratedSubDocument,
  BasicSubDocument,
} from 'synapsepay';
import { diffSynapsePayUser, fetchSynapsePayUser } from './user';
import { dogstatsd } from '../../lib/datadog-statsd';
import gcloudKms from '../../lib/gcloud-kms';
import { FraudAlert, SynapsepayDocument, User } from '../../models';
import { FraudAlertReason, SynapsepayDocumentSSNStatus } from '../../typings';
import { DocumentType } from './types';
import { mungeSynapsePayUserPayload } from './core';
import logger from '../../lib/logger';

/**
 * SynapsePay api v3.1 data munger
 * Extracts document status from SynapsePay API response and prepares for inserting/updating synapsepay_document row
 * documentType {String} SSN, IP, EMAIL, PHONE_NUMBER
 * documentResponse {Object} response from
 * GET  uat-api.synapsefi.com/v3.1/users/:user_id { documents[{ }, ...] }
 */
function _extractSynapsePayDocumentStatus(
  documentType: DocumentType,
  synapsePayResponse: UserJSON,
): string {
  // just a dumb mapping of each document type to the data structure returned by synapsepay api
  // SynapsePay uses 3 categories for documents: virtual_docs (ssn), physical_docs (license), and social_docs (email, phone number)
  // see: https://docs.synapsePayClient.com/docs/adding-documents
  const hashMap: { [key: string]: string } = {
    SSN: 'virtual_docs', // e.g. the literal path to an ssn doc is synapsePayResponse.documents[0].virtual_docs[0]
    GOVT_ID: 'physical_docs',
  };

  const documents: Array<DehydratedSubDocument | BasicSubDocument> = get(
    synapsePayResponse.documents[0],
    hashMap[documentType],
  );
  const doc = find(documents, {
    document_type: documentType,
  });
  let status;
  if (doc) {
    // statuses: https://docs.synapsefi.com/docs/sub-documents-intro
    const statusArray = doc.status.split('|');
    status = statusArray[statusArray.length - 1];
  }
  return status;
}

/**
 * SynapsePay api v3.1 data munger
 * Massages data returned by successful responses into synapsepay_document rows
 * (200) POST uat-api.synapsefi.com/v3.1/users {User}.documents[{ }, ...]
 * GET  uat-api.synapsefi.com/v3.1/users/:user_id { documents[{ }, ...] }
 */
export async function _collateSynapsePayDocumentRow(
  ip: string,
  daveUser: User,
  synapsePayResponse: UserJSON,
  synapsePayUserPayload: CreateUserPayload | ReturnType<typeof mungeSynapsePayUserPayload>,
  fields: SynapsePayUserUpdateFields = {},
): Promise<Partial<SynapsepayDocument>> {
  // original document contents
  const {
    name,
    month,
    day,
    year,
    address_street,
    address_city,
    address_subdivision,
    address_postal_code,
  } = synapsePayUserPayload.documents[0];
  delete synapsePayUserPayload.documents[0];

  const { phoneNumber } = daveUser;
  const { ssn, email, license } = fields;
  const encryptedSsn = ssn ? (await gcloudKms.encrypt(ssn)).ciphertext : null;

  const unfiltered = {
    name,
    email,
    month,
    day,
    year,
    addressStreet: address_street,
    addressCity: address_city,
    addressSubdivision: address_subdivision,
    addressPostalCode: address_postal_code,
    phoneNumber,
    ssn: encryptedSsn,
    license,
    ip,
    userId: daveUser.id,
    synapsepayUserId: synapsePayResponse._id,
    synapsepayDocId: synapsePayResponse.documents[0].id,
    permission: synapsePayResponse.permission,
    idScore: synapsePayResponse.documents[0].id_score,
    licenseStatus:
      _extractSynapsePayDocumentStatus(DocumentType.GOVT_ID, synapsePayResponse) || null,
    ssnStatus: _extractSynapsePayDocumentStatus(DocumentType.SSN, synapsePayResponse),
  };

  // reject fields with undefined values to avoid null-ifying existing values
  return omitBy(unfiltered, isNil);
}

async function updateSynapsePayDocument(
  userId: number,
  synapsePayData: UserJSON,
  patchData?: UpdateUserPayload,
): Promise<SynapsepayDocument> {
  const document = await SynapsepayDocument.findOne({ where: { userId }, paranoid: false });
  if (document) {
    const source = patchData || synapsePayData;

    const ssnStatus = _extractSynapsePayDocumentStatus(DocumentType.SSN, synapsePayData);
    const updates = {
      addressCity: get(source.documents[0], 'address_city'),
      addressPostalCode: get(source.documents[0], 'address_postal_code'),
      addressStreet: get(source.documents[0], 'address_street'),
      addressSubdivision: get(source.documents[0], 'address_subdivision'),
      day: get(source.documents[0], 'day'),
      email: get(source.documents[0], 'email'),
      licenseStatus: _extractSynapsePayDocumentStatus(DocumentType.GOVT_ID, synapsePayData),
      month: get(source.documents[0], 'month'),
      name: get(source.documents[0], 'name'),
      phoneNumber: get(source.documents[0], 'phone_number'),
      permission: synapsePayData.permission,
      permissionCode: synapsePayData.permission_code,
      ssnStatus,
      year: get(source.documents[0], 'year'),
      idScore: get(source.documents[0], 'id_score'),
      flag: synapsePayData.flag,
      flagCode: synapsePayData.flag_code,
      watchlists: synapsePayData.watchlists,
      extra: synapsePayData.extra,
    };
    const filteredUpdates = omitBy(updates, isNil);
    await document.update(filteredUpdates);
  }
  return document;
}

export async function handleSynapsePayDocumentUpdate(
  userId: number,
  synapsePayData: UserJSON,
  patchData?: UpdateUserPayload,
): Promise<SynapsepayDocument> {
  const doc = await updateSynapsePayDocument(userId, synapsePayData, patchData);
  if (doc?.ssnStatus === SynapsepayDocumentSSNStatus.Blacklist) {
    await handleBlacklistSsn(userId);
  }
  return doc;
}

async function handleBlacklistSsn(userId: number): Promise<void> {
  const [existingFraudAlert, user] = await Promise.all([
    FraudAlert.findOne({
      where: { userId, reason: FraudAlertReason.BlacklistSsn },
    }),
    User.findByPk(userId),
  ]);
  if (!existingFraudAlert && user) {
    logger.info('Blacklist ssn', { userId });
    dogstatsd.increment('synapsepay.update_document.blacklist_ssn');
    //TODO: enable fraud alert creation once Synpase blacklist bug is resolved
    // await FraudAlert.createFromUserAndReason(user, FraudAlertReason.BlacklistSsn);
  }
}

/*
 * Create a synapsepay document in our system based on a synapse user ID we already have,
 * the user in Synapse's system,
 * and the data the user submitted to us.
 */
export async function _createSynapsePayDocumentForUser(
  user: User,
  ip: string,
  fields: SynapsePayUserUpdateFields = {},
) {
  // Get the current user
  const synapsePayUser = await fetchSynapsePayUser(user, { ip });
  let synapsePayJson: UserJSON = synapsePayUser.json;
  const payload = mungeSynapsePayUserPayload(ip, user, fields);

  // compare GET SynapsePay user response with formtted payload
  const patchPayload = diffSynapsePayUser(synapsePayJson as DehydratedUser, payload);

  // PATCH is required
  if (Object.keys(patchPayload).length > 0) {
    synapsePayJson = (await synapsePayUser.updateAsync(patchPayload)).json;
  }

  const collatedDocument = await _collateSynapsePayDocumentRow(
    ip,
    user,
    synapsePayJson,
    payload,
    fields,
  );

  await SynapsepayDocument.create(collatedDocument);
}

export default {
  updateSynapsePayDocument,
  _extractSynapsePayDocumentStatus,
};
