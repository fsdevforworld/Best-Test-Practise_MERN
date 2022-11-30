// tslint:disable: no-require-imports
import { get } from 'lodash';
import { CreateUserPayload, UpdateUserPayload } from 'synapsepay';
import factory from '../../factories';
import { SynapsepayDocument, User } from '../../../src/models';
import {
  getFingerprint,
  upsertSynapsePayUser,
  users,
  fetchUserFromSynapsepay,
} from '../../../src/domain/synapsepay';
import {
  _collateSynapsePayDocumentRow,
  handleSynapsePayDocumentUpdate,
} from '../../../src/domain/synapsepay/document';
import authenticationClient from '../../../src/domain/synapsepay/authentication-client';
import { Address } from '../../../src/typings';
import { moment } from '@dave-inc/time-lib';
import { mungeSynapsePayUserPayload } from '../../../src/domain/synapsepay/core';

export async function setupSynapsePayUser(options?: {
  userId?: number;
  phoneNumber?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  address?: Address;
  birthdate?: string;
}): Promise<User> {
  const user = await factory.create<User>('user', {
    id: get(options, 'userId', 123),
    synapsepayId: null,
    phoneNumber: get(options, 'phoneNumber', '+17778889999'),
    firstName: get(options, 'firstName', 'Louise'),
    lastName: get(options, 'lastName', 'Belcher'),
    email: get(options, 'email'),
    addressLine1: get(options, ['address', 'addressLine1']),
    addressLine2: get(options, ['address', 'addressLine2']),
    city: get(options, ['address', 'city']),
    state: get(options, ['address', 'state']),
    zipCode: get(options, ['address', 'zipCode']),
    birthdate: get(options, 'birthdate') ? moment(options.birthdate) : undefined,
  });
  await upsertSynapsePayUser(user, undefined, {
    firstName: user.firstName,
    lastName: user.lastName,
    email: user.email,
    addressLine1: user.addressLine1,
    addressLine2: user.addressLine2,
    city: user.city,
    state: user.state,
    zipCode: user.zipCode,
    birthdate: user.birthdate ? user.birthdate.format('YYYY-MM-DD') : undefined,
  });
  return user;
}

export const generateLicense = (buffer: string = 'random_string'): Express.Multer.File => {
  const multer = require('multer');
  const license = multer();
  license.buffer = buffer;
  return license;
};

export const createUserWithNewFingerprint = async ({
  ip = '192.168.0.124',
  userId = 123,
}: { ip?: string; userId?: number } = {}): Promise<User> => {
  const user = await factory.create<User>('user', {
    id: userId,
    synapsepayId: null,
    phoneNumber: '+17778889999',
    firstName: 'Randy',
    lastName: 'Moss',
  });
  const fields = {
    firstName: user.firstName,
    lastName: user.lastName,
  };
  const payload = mungeSynapsePayUserPayload(ip, user, fields);
  const fingerprint = await getFingerprint(user.id, { forceAlternateSecret: true });
  const synapsePayUser = (
    await users.createAsync(authenticationClient, fingerprint, ip, payload as CreateUserPayload)
  ).json;
  const collatedDocument = await _collateSynapsePayDocumentRow(
    ip,
    user,
    synapsePayUser,
    payload,
    fields,
  );
  await SynapsepayDocument.sequelize.transaction(async t => {
    await user.update({ synapsepayId: synapsePayUser._id }, { transaction: t });
    return await SynapsepayDocument.create(collatedDocument, { transaction: t });
  });
  return user;
};

export const updateSynapsepayUser = async (user: User, payload: UpdateUserPayload) => {
  const synapsepayUser = await fetchUserFromSynapsepay(user);

  const updateJson = (await synapsepayUser.updateAsync(payload)).json;

  await handleSynapsePayDocumentUpdate(user.id, updateJson, payload);
};
