import {
  AdvanceComplexResponse,
  AdvanceResponse,
  AdvanceRulesResponse,
  AdvanceScreenshotResponse,
  AdvanceTermsResponse,
  FeeResponse,
  PaymentProviderDelivery,
} from '@dave-inc/wire-typings';
import * as Bluebird from 'bluebird';
import { Request, Response } from 'express';
import { get as _get, partial } from 'lodash';
import {
  AdvanceOptions,
  DonationInfo,
  getAdvanceApproval,
  getAdvanceById,
  getAdvancePaymentMap,
  getAdvancesByUser,
  getBankAccountForAdvance,
  requestAdvance,
  updateAdvance,
  uploadScreenshot,
  verifyAdvanceAmount,
} from './controller';
import { formatAdvanceRejectionResponse, formatAdvanceTermsResponse } from './helper';

import { ForceAppReInstallError, InvalidParametersError, NotFoundError } from '../../../lib/error';
import * as Utils from '../../../lib/utils';
import { minVersionCheckFromRequest } from '../../../lib/utils';
import { decode } from '../../../lib/jwt';
import { InvalidParametersMessageKey } from '../../../translations';
import { IDaveRequest, IDaveResponse } from '../../../typings';
import { getEventPropertiesFromRequest } from '../../../lib/appsflyer';
import { verifyUserIdentity } from '../../../helper/user';
import { serializeAdvanceComplexResponse } from '../../../serialization';
import { BankAccount } from '../../../models';
import { getFeesByAmount } from '../../../domain/advance-delivery';
import AdvanceApprovalClient from '../../../lib/advance-approval-client';

export const MIN_VERSION = '2.9.0';
export const DONATION_ORG_OPTIONS_APP_VERSION = '2.10.4';
export const DONATION_UPDATED_APP_VERSION = '2.12.5';
export const MIN_VERSION_RULES = '2.25.1';

/**
 * Get advance details for an advance identified by an encoded token
 * @param  {object} req  Request information
 * @param  {object} res Response Object to return
 * @return {object} Response object
 */
// used by web payback form
async function getAdvanceByToken(
  req: Request,
  res: IDaveResponse<AdvanceComplexResponse>,
): Promise<Response> {
  let id;
  try {
    id = decode(req.params.token).id;
  } catch (error) {
    throw new NotFoundError('Cannot find advance');
  }

  const advance = await getAdvanceById(id);

  if (!advance) {
    throw new NotFoundError('Cannot find advance');
  }

  const serializedAdvance = await serializeAdvanceComplexResponse(advance, 'MMMM D, YYYY');
  return res.send(serializedAdvance);
}

async function fees(req: IDaveRequest, res: IDaveResponse<FeeResponse>): Promise<void> {
  const rawAmount = _get(req, 'query.amount');
  const amount = Number(rawAmount);
  if (rawAmount) {
    verifyAdvanceAmount(amount);
  }

  const result: FeeResponse = getFeesByAmount(amount);

  res.send(result);
}

async function terms(
  req: IDaveRequest,
  res: IDaveResponse<AdvanceTermsResponse | AdvanceTermsResponse[]>,
): Promise<Response> {
  const { bank_account_id: bankAccountId, showAllResults = false } = req.query;
  const rawAmount = _get(req, 'query.amount');
  const amount = Number(rawAmount);
  if (rawAmount) {
    verifyAdvanceAmount(amount);
  }

  if (!Utils.minVersionCheckFromRequest(req, MIN_VERSION)) {
    //TODO: make this throw an InvalidParametersError once the borrow screen can handle errors
    const body = { approved: false, message: 'Please update to the latest version of Dave.' };
    return res.send(showAllResults ? [body] : body);
  }

  const appScreen = req.get('X-App-Screen');

  const approvalResponses = await getAdvanceApproval(bankAccountId, req.user, amount, appScreen);

  if (!approvalResponses[0].approved) {
    const approvalResponse = approvalResponses[0];
    const body = formatAdvanceRejectionResponse(approvalResponse, req.t);
    return res.send(showAllResults ? [body] : body);
  } else {
    const results = await Bluebird.map(
      approvalResponses,
      partial(formatAdvanceTermsResponse, amount),
    );

    return res.send(showAllResults ? results : results[0]);
  }
}

/*
 * Request an advance
 * required body params:
 * bank_account_id
 * amount
 * deliveryType ('standard', 'express')
 * tip_percent
 */
async function request(req: IDaveRequest, res: IDaveResponse<AdvanceResponse>): Promise<void> {
  const {
    bank_account_id: bankAccountId,
    recurringTransactionId = null,
    delivery = PaymentProviderDelivery.EXPRESS,
    paybackDate,
    tip_percent: tipPercent,
    donationOrganization,
    screenshotUrl,
  } = req.body;

  const deliveryType: PaymentProviderDelivery = delivery;
  const user = req.user;
  const amount = Number(_get(req, 'body.amount')); // passed in as string but needs to be a number
  if (
    deliveryType !== PaymentProviderDelivery.EXPRESS &&
    deliveryType !== PaymentProviderDelivery.STANDARD
  ) {
    throw new InvalidParametersError(InvalidParametersMessageKey.AdvanceDeliveryType);
  }

  verifyAdvanceAmount(amount);

  const bankAccount = await getBankAccountForAdvance(bankAccountId, req.user);

  if (await requiresIdentityVerification(bankAccount)) {
    const { success, error } = await verifyUserIdentity(req.user, {
      isAdmin: false,
      auditLog: true,
    });

    if (!success) {
      throw new InvalidParametersError(error);
    }
  }

  const advanceOptions: AdvanceOptions = {
    amount,
    recurringTransactionId,
    paybackDate,
    deliveryType,
    tipPercent,
  };
  const donationInfo: DonationInfo = {
    donationOrganization,
    isTreesOnlyAppVersion: !Utils.minVersionCheckFromRequest(req, DONATION_ORG_OPTIONS_APP_VERSION),
    isUpdatedAppVersion: Utils.minVersionCheckFromRequest(req, DONATION_UPDATED_APP_VERSION),
  };
  const analyticsData = getEventPropertiesFromRequest(req);
  const advance = await requestAdvance(
    bankAccount,
    user,
    advanceOptions,
    donationInfo,
    analyticsData,
    screenshotUrl,
  );

  const serializedAdvanceWithTip = await advance.serializeAdvanceWithTip();
  res.send(serializedAdvanceWithTip);
}

async function requiresIdentityVerification(bankAccount: BankAccount) {
  const isDaveBanking = await bankAccount.isDaveBanking();
  return !isDaveBanking;
}

async function rules(
  req: IDaveRequest,
  res: IDaveResponse<AdvanceRulesResponse>,
): Promise<Response> {
  const bankAccount = await req.user.getDefaultBankAccount();
  const isDaveBanking = await bankAccount?.isDaveBanking();
  const hasMinVersion = minVersionCheckFromRequest(req, MIN_VERSION_RULES);
  // TODO remove once we fix the frontend
  if (isDaveBanking && !hasMinVersion) {
    throw new ForceAppReInstallError('Rules are inconsistent for dave banking users');
  }

  const advanceRules = await AdvanceApprovalClient.getRules({ isDaveBanking });

  return res.send(advanceRules);
}

/*
 * get screenshot URL after successful upload to GCP
 * required body params:
 * screenshotContents
 */
async function upload(
  req: IDaveRequest,
  res: IDaveResponse<AdvanceScreenshotResponse>,
): Promise<Response> {
  const screenshotContents = req.file || req.body.screenshot_contents;
  if (!screenshotContents) {
    throw new InvalidParametersError(InvalidParametersMessageKey.NoImageProvided);
  }
  const screenshotUrl = await uploadScreenshot(screenshotContents, req.user.id);
  return res.send({ screenshotUrl });
}

/*
 * update an advance (tip only)
 * required body params:
 * advance_id
 * tip_percent
 */
async function update(
  req: IDaveRequest,
  res: IDaveResponse<{ success: boolean }>,
): Promise<Response> {
  const advanceId = req.params.id;

  // Tip percent.
  const tipPercent = req.body.tip_percent;
  const source = req.body.source || 'user';
  const analyticsData = getEventPropertiesFromRequest(req);
  // In order to stay backward compatible we need to check both places
  // where image could be passed
  const screenshotContents = req.file || req.body.screenshot_contents;

  await updateAdvance(
    Number(advanceId),
    req.user.id,
    tipPercent,
    source,
    analyticsData,
    screenshotContents,
  );

  return res.send({ success: true });
}

async function get(
  req: IDaveRequest,
  res: IDaveResponse<AdvanceComplexResponse[]>,
): Promise<Response> {
  const paymentMap = await getAdvancePaymentMap(req.user.id);
  const advances = await getAdvancesByUser(req.user.id);
  const complexAdvances = await Promise.all(
    advances.map(async advance =>
      serializeAdvanceComplexResponse(advance, 'YYYY-MM-DD', paymentMap[advance.id]),
    ),
  );

  return res.send(complexAdvances);
}

export default {
  fees,
  get,
  getAdvanceByToken,
  request,
  rules,
  terms,
  update,
  upload,
};
