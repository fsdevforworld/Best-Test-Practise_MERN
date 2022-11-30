import { get, has } from 'lodash';
import * as SynapsePay from 'synapsepay';
import {
  BaseDocumentUpdate,
  CreateBaseDocumentPayload,
  CreateUserPayload,
  DehydratedBaseDocument,
  DehydratedUser,
  SynapsePayExtras,
  SynapsePayUserUpdateFields,
  User as SynapsePayUser,
} from 'synapsepay';
import { ValuesType } from 'utility-types';
import { dogstatsd } from '../../lib/datadog-statsd';
import { InvalidParametersError, NotFoundError } from '../../lib/error';
import logger from '../../lib/logger';
import redis from '../../lib/redis';
import { isDevEnv } from '../../lib/utils';
import { AuditLog, SynapsepayDocument, ThirdPartyName, User, UserIpAddress } from '../../models';
import authenticationClient from './authentication-client';
import Constants from './constants';
import { mungeSynapsePayUserPayload, SynapsePayUserDetails } from './core';
import {
  _collateSynapsePayDocumentRow,
  _createSynapsePayDocumentForUser,
  handleSynapsePayDocumentUpdate,
} from './document';
import { helpers, statements, users } from './external-model-definitions';
import getFingerprint from './get-fingerprint';

enum SynapseUpsertEvent {
  CreateDocument = 'Create SynapsePay document for user',
  CreateUser = 'Create SynapsePay user',
  UpdateUser = 'Update SynapsePay user',
}

export async function getSynapsePayUserStatements(
  user: SynapsePayUserDetails,
  extras: any = {},
): Promise<SynapsePay.Statement[]> {
  const synapsePayUser = await fetchSynapsePayUser(user, extras);
  const statementsResponse = await statements.getAsync(synapsePayUser, {});
  return statementsResponse.statements;
}

export async function withSynapsePayUser(
  user: SynapsePayUserDetails,
  extras: SynapsePayExtras = {},
  processFn: (synapsePayUser: SynapsePay.User) => Promise<any>,
) {
  let synapsePayUser = await getSynapsePayUser(user, extras);

  try {
    return await processFn(synapsePayUser);
  } catch (rawError) {
    const synapseErrorCode = get(rawError, 'response.body.error_code');

    if (synapseErrorCode === Constants.SYNAPSEPAY_INVALID_OR_EXPIRED_OAUTH_KEY_ERROR_CODE) {
      synapsePayUser = await getSynapsePayUser(user, extras, { forceRefreshToken: true });

      dogstatsd.increment('synapsepay.auth.refreshed_oauth_token');

      return await processFn(synapsePayUser);
    }

    const { statusCode, status } = rawError;

    const error = statusCode ? statusCode : status;

    dogstatsd.increment('synapsepay.auth.unhandled_error', { error });
    logger.error('Unhandled error when getting SynapsePay Node', { rawError });

    throw rawError;
  }
}

export async function getSynapsePayUser(
  user: SynapsePayUserDetails,
  extras: SynapsePayExtras = {},
  { forceRefreshToken = false }: { forceRefreshToken?: boolean } = {},
): Promise<SynapsePay.User> {
  let synapsePayUser = await getSynapsePayUserFromCache(user.synapsepayId, forceRefreshToken);

  if (!synapsePayUser) {
    synapsePayUser = await fetchSynapsePayUser(user, extras);
    if (user.synapsepayId === Constants.SYNAPSEPAY_DISBURSING_USER_ID) {
      await cacheDisbursingSynapsePayUser(synapsePayUser);
    }
  }

  return synapsePayUser;
}

export async function fetchSynapsePayUser(
  user: SynapsePayUserDetails,
  extra?: { ip?: string; fingerPrint?: string },
): Promise<SynapsePayUser<DehydratedUser>>;
export async function fetchSynapsePayUser(
  user: SynapsePayUserDetails,
  extras: SynapsePayExtras = {},
) {
  if (!user.synapsepayId) {
    throw new NotFoundError(
      `Could not find SynapsePay User because synapsepayId is missing for User id: ${user.id}`,
    );
  }

  const fullDehydrate = extras.withoutFullDehydrate ? undefined : 'yes';
  const options = {
    _id: user.synapsepayId,
    fingerprint: extras.fingerPrint || (await getFingerprint(user)),
    ip_address: extras.ip || helpers.getUserIP(),
    full_dehydrate: fullDehydrate,
  };

  let synapsePayUser;
  try {
    synapsePayUser = await users.getAsync(authenticationClient, options);
  } catch (errorResponse) {
    const parsedError = errorResponse.body;
    // for a brief period in July 2019, users were registered with a different fingerprint
    // catch the fingerprint error from Synapsepay and fetch the user with the new fingerprint
    if (get(parsedError, 'error_code') === Constants.SYNAPSEPAY_USER_FINGERPRINT_ERROR_CODE) {
      synapsePayUser = await handleFingerprintError(user, options);
    } else {
      throw errorResponse;
    }
  }
  return synapsePayUser;
}

async function getSynapsePayUserFromCache(
  synapsepayId: string,
  forceRefreshToken: boolean = false,
): Promise<SynapsePay.User | null> {
  if (synapsepayId === Constants.SYNAPSEPAY_DISBURSING_USER_ID && !forceRefreshToken) {
    return getDisbursingSynapsePayUserFromCache();
  }

  return null;
}

async function getDisbursingSynapsePayUserFromCache(): Promise<SynapsePay.User | null> {
  try {
    return JSON.parse(await redis.getAsync(Constants.SYNAPSEPAY_DISBURSING_USER_CACHE_KEY));
  } catch (error) {
    logger.error('JSON parsing error when getting synapse disbursing user from cache', { error });
    return null;
  }
}

async function cacheDisbursingSynapsePayUser(
  rawSynapsePayUser: Partial<{
    client: any;
    fingerprint: string;
    ip_address: string;
    oauth_key: string;
    json: any;
  }>,
): Promise<void> {
  const { client, fingerprint, ip_address, oauth_key } = rawSynapsePayUser;

  const json = {
    _links: {
      self: {
        href: rawSynapsePayUser.json._links.self.href,
      },
    },
  };
  await redis.setAsync(
    Constants.SYNAPSEPAY_DISBURSING_USER_CACHE_KEY,
    JSON.stringify({ client, fingerprint, ip_address, oauth_key, json }),
  );
}

async function handleFingerprintError(
  user: SynapsePayUserDetails,
  options: any,
): Promise<SynapsePayUser> {
  dogstatsd.increment('synapsepay.get_user.fingerprint_error');
  const newUserFingerprint = getFingerprint(user, { forceAlternateSecret: true });
  try {
    const synapsePayUser = await users.getAsync(authenticationClient, {
      ...options,
      fingerprint: newUserFingerprint,
    });
    await addUserToFingerprintCache(user.id);
    dogstatsd.increment('synapsepay.get_user.fingerprint_error.resolved.new_fingerprint_match');
    return synapsePayUser;
  } catch (error) {
    logger.error(`Failed to get synapsepay user with new fingerprint`, { error });
    throw error;
  }
}

export async function addUserToFingerprintCache(userId: number): Promise<void> {
  const key = Constants.SYNAPSEPAY_USER_FINGERPRINT_REDIS_KEY;
  await redis.saddAsync(key, userId.toString());
}

export async function checkFingerprintCache(userSecret: string): Promise<number> {
  if (!userSecret) {
    return 0;
  }
  const key = Constants.SYNAPSEPAY_USER_FINGERPRINT_REDIS_KEY;
  return redis.sismemberAsync(key, userSecret);
}

export async function _patchSynapsePayUser(
  user: User,
  ip: string,
  fields: SynapsePayUserUpdateFields = {},
) {
  const synapsePayUser = await fetchSynapsePayUser(user, { ip });
  let synapseJson: SynapsePay.UserJSON = synapsePayUser.json;

  const postPayload = mungeSynapsePayUserPayload(ip, user, fields);

  const patchPayload = diffSynapsePayUser(synapseJson as DehydratedUser, postPayload);

  const updateRequired = Object.keys(patchPayload).length > 0;
  if (updateRequired) {
    synapseJson = (await synapsePayUser.updateAsync(patchPayload)).json;
  }

  const patchData = updateRequired ? patchPayload : null;
  return handleSynapsePayDocumentUpdate(user.id, synapseJson, patchData);
}

/**
 * Deep comparison between the results GET SynapsePay user and payload with potential updates
 * Returns fieldset needing PATCH. empty object returned if no PATCH is required
 */

export function diffSynapsePayUser(
  current: DehydratedUser,
  update: ReturnType<typeof mungeSynapsePayUserPayload>,
) {
  const currentDocument = current.documents[0];
  const updateDocument = update.documents[0];
  const patchDocument: BaseDocumentUpdate = { id: currentDocument.id };
  let documentChanged = false;

  const fields: Array<'name' | 'email' | 'phone_number'> = ['name', 'email', 'phone_number'];

  fields.forEach(field => {
    if (updateDocument[field] && !areMatch(updateDocument[field], currentDocument[field])) {
      patchDocument[field] = updateDocument[field];
      documentChanged = true;
    }
  });

  if (updateDocument.day) {
    patchDocument.day = updateDocument.day;
    patchDocument.month = updateDocument.month;
    patchDocument.year = updateDocument.year;
    documentChanged = true;
  }

  if (updateDocument.address_street) {
    patchDocument.address_street = updateDocument.address_street;
    patchDocument.address_city = updateDocument.address_city;
    patchDocument.address_subdivision = updateDocument.address_subdivision;
    patchDocument.address_postal_code = updateDocument.address_postal_code;
    patchDocument.address_country_code = updateDocument.address_country_code;
    documentChanged = true;
  }

  if (updateDocument.physical_docs && updateDocument.physical_docs.length > 0) {
    patchDocument.physical_docs = updateDocument.physical_docs;
    documentChanged = true;
  }

  // docs indicate only last 4 come back in a dehydrate, but I'm seeing everything in requests against both production and sandbox
  if (
    updateDocument.virtual_docs &&
    (currentDocument.virtual_docs.length === 0 ||
      currentDocument.virtual_docs[0].document_value !==
        updateDocument.virtual_docs[0].document_value)
  ) {
    patchDocument.virtual_docs = updateDocument.virtual_docs;
    documentChanged = true;
  }

  return documentChanged ? { documents: [patchDocument] } : {};
}

function areMatch(
  updateVal: ValuesType<CreateBaseDocumentPayload>,
  currVal: ValuesType<DehydratedBaseDocument>,
): boolean {
  return typeof updateVal === 'string' && typeof currVal === 'string'
    ? updateVal.toLowerCase() === currVal.toLowerCase()
    : updateVal === currVal;
}

/**
 * Creates a SynapsePay User
 * https://docs.synapsePayClient.com/docs/create-a-user
 * Stores uuids for SynapsePay User / Document resources
 */
export async function _createSynapsePayUser(
  user: User,
  ip: string,
  fields: SynapsePayUserUpdateFields = {},
) {
  if (!user.firstName || !user.lastName) {
    const thirdPartyName = await ThirdPartyName.findOne({ where: { userId: user.id } });
    if (!thirdPartyName || thirdPartyName.isInvalid) {
      throw new InvalidParametersError('Cannot create Synapse User without first and last name');
    }

    fields.firstName = thirdPartyName.firstName;
    fields.lastName = thirdPartyName.lastName;
  }

  // Not very Typesafe since we are casting!!!
  const payload = mungeSynapsePayUserPayload(ip, user, fields) as CreateUserPayload;

  const fingerprint = await getFingerprint(user);
  const synapsePayUserJson = (
    await users.createAsync(authenticationClient, fingerprint, ip, payload)
  ).json;

  // we don't store license
  delete fields.license;

  const collatedDocument = await _collateSynapsePayDocumentRow(
    ip,
    user,
    synapsePayUserJson,
    payload,
    fields,
  );

  try {
    await SynapsepayDocument.sequelize.transaction(async t => {
      await user.update({ synapsepayId: synapsePayUserJson._id }, { transaction: t });
      return await SynapsepayDocument.create(collatedDocument, { transaction: t });
    });
  } catch (ex) {
    dogstatsd.increment('synapsepay.create_user_error', 1, [`error_name:${ex.name}`]);
    throw ex;
  }
  return synapsePayUserJson._id;
}

/**
 * Creates SynapsePay User, or updates existing SynapsePay user's documents
 * Valid documents with unchanged values are not updated, to avoid re-submitting them for review
 * https://docs.synapsePayClient.com/docs/get-user
 * https://docs.synapsePayClient.com/docs/create-a-user
 * @params {Number} userId - pkey of user table row
 * @params {Number} synapseId - synapsepay's uuid
 * @params {Object} document key:value pairs
 * @params {Object}
 */
export async function upsertSynapsePayUser(
  user: User,
  ip: string,
  fields: SynapsePayUserUpdateFields = {},
): Promise<SynapsepayDocument> {
  if (!ip) {
    const lastUserIp = await UserIpAddress.findOne({
      where: { userId: user.id },
      order: [['lastSeen', 'desc']],
    });
    ip = lastUserIp ? lastUserIp.ipAddress : '127.0.0.1';
  }
  // create a synapsepay user
  const synapseDocument = await SynapsepayDocument.findOne({ where: { userId: user.id } });
  let synapseUpsertEvent;
  try {
    if (user.synapsepayId && !synapseDocument) {
      // a remnant from the old system
      synapseUpsertEvent = SynapseUpsertEvent.CreateDocument;
      await _createSynapsePayDocumentForUser(user, ip, fields);
    } else if (!user.synapsepayId) {
      synapseUpsertEvent = SynapseUpsertEvent.CreateUser;
      await _createSynapsePayUser(user, ip, fields);
    } else {
      synapseUpsertEvent = SynapseUpsertEvent.UpdateUser;
      // user already exists, get existing documents, diff to determine
      await _patchSynapsePayUser(user, ip, fields);
    }
  } catch (error) {
    dogstatsd.increment('synapsepay.user.upsert_failure');
    await AuditLog.create({
      userId: user.id,
      successful: false,
      type: 'UPSERT_SYNAPSEPAY_USER',
      extra: error,
      message: error.message,
    });
    if (has(error, 'response.body.error')) {
      delete fields.ssn;
      delete fields.license;
      throw new InvalidParametersError(error.response.body.error.en, {
        data: { userId: user.id, fields, synapseUpsertEvent },
      });
    } else {
      throw error;
    }
  }

  dogstatsd.increment('synapsepay.user.upsert_success');

  return SynapsepayDocument.findOne({ where: { userId: user.id } });
}

export async function deleteSynapsePayUser(
  user: User,
  extras: SynapsePayExtras = {},
): Promise<void> {
  let synapsePayUser: SynapsePayUser;
  try {
    synapsePayUser = await fetchSynapsePayUser(user, extras);
  } catch (error) {
    if (error.statusCode === 404) {
      // There's no synapsepayId to start with.
      return;
    }
    if (error.status === 404) {
      // Synapsepay says id doesn't exist.
      return;
    }
    if (error.status === 202 && isDevEnv()) {
      // mobile app gets stuck on a loading screen after user deletes their account.
      // only happening in dev.
      return;
    }
    // Throws for other http request errors.
    throw error;
  }

  const userUpdatePayload = {
    permission: Constants.DELETE_USER_PERMISSION,
  };
  await synapsePayUser.updateAsync(userUpdatePayload);
  await user.update({ synapsepayId: null });
}
