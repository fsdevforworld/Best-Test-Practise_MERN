import { InvalidParametersError } from '../../lib/error';
import { omit } from 'lodash';
import { aggregateBroadcastCalls } from '../../domain/user-updates';
import gcloudKms from '../../lib/gcloud-kms';
import * as EmailVerificationHelper from '../../helper/email-verification';
import UserHelper, { verifyUserIdentity } from '../../helper/user';
import PubSub from '../../lib/pubsub'; //TODO: figure out how to regularly check for + update approval status
import { deepTrim, getParams, updateAndGetModifications } from '../../lib/utils';
import { IDaveRequest, IDaveResponse, UserUpdateFields } from '../../typings';
import { AuditLog } from '../../models';
import { Response } from 'express';
import { IIdentityVerificationResult, IdentityVerificationResponse } from '@dave-inc/wire-typings';
import * as SynapsePay from '../../domain/synapsepay';
import { InvalidParametersMessageKey } from '../../translations';

export enum Metric {
  BankAccountNotFound = 'identity_verification.bank_account_not_found',
}

async function getApproval(
  req: IDaveRequest,
  res: IDaveResponse<IdentityVerificationResponse>,
): Promise<Response> {
  const identityVerification: IIdentityVerificationResult = await verifyUserIdentity(req.user, {
    isAdmin: false,
    auditLog: false,
  });

  if (identityVerification.success) {
    return res.send({ approved: true });
  } else {
    if (req.query.notify) {
      await PubSub.publish('verification-update', { userId: req.user.id });
    }
    return res.send({
      approved: false,
      status: identityVerification.status,
      message: identityVerification.error,
    });
  }
}

async function submit(req: IDaveRequest, res: IDaveResponse<IdentityVerificationResponse>) {
  const body = deepTrim(req.body);
  const { user } = req;
  const params = getParams(
    body,
    [
      'firstName',
      'lastName',
      'email',
      'addressLine1',
      'city',
      'state',
      'zipCode',
      'birthdate',
      'ssn',
    ],
    ['addressLine2', 'skipAddressVerification'],
  );
  const {
    firstName,
    lastName,
    email,
    addressLine1,
    addressLine2,
    city,
    state,
    zipCode,
    birthdate,
    ssn,
    skipAddressVerification,
  } = params;

  let encryptedSsn;
  if (ssn) {
    const { ciphertext } = await gcloudKms.encrypt(ssn);
    encryptedSsn = ciphertext;
  }

  const validatedPayload: UserUpdateFields = await UserHelper.validateParams(
    user,
    params,
    {
      ssn: encryptedSsn,
    },
    skipAddressVerification,
  );

  await EmailVerificationHelper.attemptCreateAndSendEmailVerification({
    id: user.id,
    newEmail: email,
    oldEmail: user.email,
  });

  const modifications = await updateAndGetModifications(user, validatedPayload);

  await user.reload();

  const synapseUpdatePayload = {
    firstName,
    lastName,
    addressLine1,
    addressLine2,
    city,
    state,
    zipCode,
    birthdate,
  };

  await SynapsePay.upsertSynapsePayUser(user, req.ip, {
    ...synapseUpdatePayload,
    email,
    ssn,
  });

  await Promise.all([
    UserHelper.logModifications({
      modifications,
      userId: user.id,
      type: AuditLog.TYPES.IDENTITY_VERIFICATION_ENDPOINT,
      requestPayload: omit(params, 'ssn'),
    }),
    ...aggregateBroadcastCalls({
      userId: user.id,
      modifications,
      updateFields: validatedPayload,
      updateSynapse: false,
    }),
  ]);

  return getApproval(req, res);
}

async function submitGovernmentId(
  req: IDaveRequest,
  res: IDaveResponse<IdentityVerificationResponse>,
): Promise<Response> {
  const license = req.file;

  if (!license) {
    throw new InvalidParametersError(InvalidParametersMessageKey.NoImageProvided);
  }

  await SynapsePay.upsertSynapsePayUser(req.user, req.ip, { license });

  return getApproval(req, res);
}

async function getStatus(
  req: IDaveRequest,
  res: IDaveResponse<IdentityVerificationResponse>,
): Promise<Response> {
  return getApproval(req, res);
}

export default {
  submit,
  submitGovernmentId,
  getStatus,
};
