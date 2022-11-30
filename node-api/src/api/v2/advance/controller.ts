import {
  DonationOrganizationCode,
  ExternalTransactionStatus,
  PaymentProviderDelivery,
} from '@dave-inc/wire-typings';
import ErrorHelper from '@dave-inc/error-helper';
import loomisClient, { PaymentMethod } from '@dave-inc/loomis-client';
import * as _ from 'lodash';
import { Moment as MomentType } from 'moment';
import { Op, UniqueConstraintError } from 'sequelize';
import * as uuid from 'uuid';
import * as Jobs from '../../../jobs/data';
import { dogstatsd } from '../../../lib/datadog-statsd';
import {
  ApprovalNotFoundError,
  ConflictError,
  CUSTOM_ERROR_CODES,
  GoogleStorageError,
  InvalidParametersError,
  PaymentError,
} from '../../../lib/error';
import gcloudStorage from '../../../lib/gcloud-storage';
import logger from '../../../lib/logger';
import { moment } from '@dave-inc/time-lib';
import PaymentProvider from '../../../lib/payment-provider';
import * as Utils from '../../../lib/utils';
import {
  Advance,
  AdvanceExperimentLog,
  AdvanceTip,
  AuditLog,
  BankAccount,
  DonationOrganization,
  Payment,
  sequelize,
  User,
} from '../../../models';
import { FailureMessageKey, InvalidParametersMessageKey } from '../../../translations';
import { AppsflyerProperties } from '../../../typings';

import { findOneAndHandleSoftDeletes } from '../../../domain/banking-data-sync/bank-accounts';
import { updateSynapseNodeId } from '../../../domain/synapsepay/nodeupdate';
import { parseLoomisGetPaymentMethod } from '../../../services/loomis-api/helper';
import { setTipPercent } from '../../../domain/advance-tip';
import AdvanceApprovalClient from '../../../lib/advance-approval-client';
import {
  AdvanceApprovalCreateResponse,
  AdvanceApprovalGetResponse,
  AdvanceApprovalTrigger,
} from '../../../services/advance-approval/types';
import { getTimezone } from '../../../domain/user-setting';
import {
  conditionallyAdjustPaybackDate,
  getAvailableDatesForNoIncome,
  getFeesByAmount,
} from '../../../domain/advance-delivery';
import * as Bluebird from 'bluebird';
import { getAdvanceSummary } from '../../../domain/advance-approval-request';

const MIN_REPAYBACK_DAYS_FOR_STANDARD_DELIVERY = 4;
const ADVANCE_SCREENSHOTS_DIRECTORY = 'advance-screenshots';
const OVERDRAFT_SCREENSHOTS_DIRECTORY = 'overdraft-screenshots';

export type AdvanceOptions = {
  amount: number;
  recurringTransactionId: number;
  paybackDate: string;
  deliveryType: PaymentProviderDelivery;
  tipPercent: number;
};

export type DonationInfo = {
  donationOrganization: string;
  isTreesOnlyAppVersion: boolean;
  isUpdatedAppVersion: boolean;
};

export function getAdvanceById(advanceId: number): Promise<Advance> {
  return Advance.findByPk(advanceId, {
    include: [BankAccount, Payment, User, { model: AdvanceTip, include: [DonationOrganization] }],
    order: [[{ model: Payment, as: 'payments' }, 'created', 'desc']],
  });
}

export async function getBankAccountForAdvance(bankAccountId: number, user: User) {
  return await findOneAndHandleSoftDeletes(bankAccountId, user, {
    bankAccountIdFrom: 'body',
  });
}

export async function getAdvanceApproval(
  bankAccountId: number,
  user: User,
  amount: number,
  appScreen: string,
): Promise<AdvanceApprovalCreateResponse[]> {
  const bankAccount = await getBankAccountForAdvance(bankAccountId, user);
  const userTimezone = await getTimezone(user.id);

  const approvalResponses = await AdvanceApprovalClient.createAdvanceApproval({
    bankAccountId: bankAccount.id,
    advanceSummary: await getAdvanceSummary(user.id),
    userId: user.id,
    userTimezone,
    appScreen,
    trigger: AdvanceApprovalTrigger.UserTerms,
  });
  const withPaybackDates = await Bluebird.map(approvalResponses, approval => {
    return conditionallyAdjustPaybackDate(approval, AdvanceApprovalTrigger.UserTerms);
  });

  if (!withPaybackDates[0].approved) {
    await bankAccount.update({ preApprovalWaitlist: moment() });
  } else {
    await bankAccount.update({ preApprovalWaitlist: null });
  }

  return withPaybackDates;
}

async function getPaymentMethod(bankAccount: BankAccount): Promise<PaymentMethod> {
  const loomisResponse = await loomisClient.getPaymentMethod({
    id: bankAccount.defaultPaymentMethodId,
  });
  const paymentMethod = parseLoomisGetPaymentMethod(loomisResponse, __filename);

  if (!paymentMethod) {
    throw new InvalidParametersError(InvalidParametersMessageKey.InvalidParametersPaymentMethodId);
  }
  if (moment(paymentMethod.expiration) < moment().add(2, 'months')) {
    throw new InvalidParametersError(
      'Cannot disburse to a card that expires in less than two months',
      { customCode: CUSTOM_ERROR_CODES.ADVANCE_PAYMENT_METHOD_EXPIRING_SOON },
    );
  }
  return paymentMethod;
}

export async function requestAdvance(
  bankAccount: BankAccount,
  user: User,
  options: AdvanceOptions,
  donationInfo: DonationInfo,
  analyticsData: AppsflyerProperties,
  screenshotUrl?: string,
): Promise<Advance> {
  const { amount, deliveryType, paybackDate } = options;

  let advance: Advance;
  let paymentMethod: PaymentMethod;

  try {
    if (bankAccount.bankConnection.requiresPaymentMethodForAdvance()) {
      paymentMethod = await getPaymentMethod(bankAccount);
    }

    if (!bankAccount.synapseNodeId) {
      await updateSynapseNodeId(bankAccount, user, analyticsData.ip);
    }

    await checkNoExistingAdvances(user.id);
    let advanceApproval: AdvanceApprovalGetResponse;
    try {
      advanceApproval = await AdvanceApprovalClient.getAdvanceApproval({
        bankAccountId: bankAccount.id,
        amount,
        recurringTransactionId: options.recurringTransactionId,
      });
    } catch (err) {
      dogstatsd.increment('advance_disbursement.eligibility_changed');
      if (err instanceof ApprovalNotFoundError || err.status === 404) {
        throw new InvalidParametersError(
          'Your advance eligibility has changed. Please reapply by starting over.',
          { customCode: CUSTOM_ERROR_CODES.ADVANCE_CHANGE_IN_ELIGIBILITY },
        );
      }
    }
    const userTimezone = Utils.getTimezoneFromZipCode(user.zipCode);
    validatePaybackDate({ deliveryType, advanceApproval, paybackDate, userTimezone });

    let calculatedTipPercent = Number(options.tipPercent);
    if (isNaN(calculatedTipPercent)) {
      const isNormalAdvance = advanceApproval.normalAdvanceApproved;
      calculatedTipPercent = (isNormalAdvance && user.settings.default_tip) || 0;
    }

    // reference ID is limited to 15 characters by Tabapay
    const referenceId = Utils.generateRandomHexString(15);
    const tip = amount * (calculatedTipPercent / 100);
    const feesByAmount = getFeesByAmount(amount);
    const fee = feesByAmount[deliveryType];
    const donationOrganizationId = await getDonationOrganizationId(donationInfo, amount);

    advance = await sequelize.transaction(async transaction => {
      const createdAdvance = await Advance.create(
        {
          userId: user.id,
          bankAccountId: bankAccount.id,
          paymentMethodId: _.get(paymentMethod, 'id'),
          chosenAdvanceApprovalId: advanceApproval.id,
          amount,
          fee,
          paybackDate: await getPaybackDate(advanceApproval, paybackDate),
          screenshotImage: screenshotUrl,
          tip,
          tipPercent: calculatedTipPercent,
          delivery: deliveryType,
          outstanding: amount + fee + tip,
          referenceId,
        },
        { transaction },
      );

      await AdvanceTip.create(
        {
          percent: calculatedTipPercent,
          amount: tip,
          advanceId: createdAdvance.id,
          donationOrganizationId,
        },
        { transaction },
      );

      return createdAdvance;
    });

    // If we don't want to disburse in staging.
    const isStagingAndShouldNotDisburse = Utils.isStagingEnv() && user.settings?.doNotDisburse;

    // Lets not do disbursement in dev. This makes life easier.
    if (!Utils.isDevEnv() && !isStagingAndShouldNotDisburse) {
      await disburseAdvance(advance, bankAccount, user, paymentMethod, analyticsData);
    }

    advance.bankAccount = bankAccount;

    Utils.nonEssentialPromiseHandler(
      AdvanceApprovalClient.updateExperiments({
        advanceId: advance.id,
        advanceApprovalId: advanceApproval.id,
      }),
      'save_user_request_experiment',
    );
  } catch (err) {
    err.paymentMethodId = paymentMethod && paymentMethod.id;
    dogstatsd.increment('advance_creation.error', {
      delivery: deliveryType,
    });

    await AuditLog.create({
      userId: user.id,
      type: 'ADVANCE_REQUEST',
      message: err.message,
      successful: false,
      eventUuid: advance && advance.id,
      extra: {
        err,
        response: err.response,
      },
    });

    if (advance && advance.disbursementStatus === ExternalTransactionStatus.Pending) {
      await advance.update({ disbursementStatus: ExternalTransactionStatus.Canceled });
    }

    if (advance) {
      await advance.destroy();
    } else if (err instanceof UniqueConstraintError) {
      logger.error('Advance Create Unique Error', { err });
      dogstatsd.increment('advance_creation.error.duplicate_request');
      throw new InvalidParametersError(InvalidParametersMessageKey.OneAdvanceAtATime, {
        customCode: CUSTOM_ERROR_CODES.ADVANCE_ONE_AT_A_TIME,
      });
    }

    throw err;
  }

  dogstatsd.increment('advance_creation.success', 1, [`delivery:${deliveryType}`]);

  return advance;
}

export async function disburseAdvance(
  advance: Advance,
  bankAccount: BankAccount,
  user: User,
  paymentMethod: PaymentMethod,
  analyticsData?: AppsflyerProperties,
) {
  const { status, id, processor, network } = await PaymentProvider.disburse(
    user,
    bankAccount,
    paymentMethod,
    advance.referenceId,
    advance.amount,
    advance.delivery,
  );

  try {
    await advance.update({
      approvalCode: network?.approvalCode,
      externalId: id,
      disbursementProcessor: processor,
      disbursementStatus: status,
      network: network?.settlementNetwork,
      networkId: network?.networkId,
    });
  } catch (err) {
    dogstatsd.increment('advance_disbursement.failed_advance_update');
    const formatted = ErrorHelper.logFormat(err);
    logger.error('Failed updating advance', { error: formatted });
  }

  if (
    status !== ExternalTransactionStatus.Completed &&
    status !== ExternalTransactionStatus.Pending
  ) {
    dogstatsd.increment('advance_disbursement.incomplete_transaction_status', 1, [
      `status:${status}`,
    ]);
    throw new PaymentError(FailureMessageKey.TransactionProcessingFailure, {
      data: { status, id, processor },
    });
  }

  await AuditLog.create({
    userId: user.id,
    type: 'ADVANCE_REQUEST',
    message: `${advance.amount} advance requested and disbursed`,
    successful: true,
    eventUuid: advance.id,
    extra: { id, status, processor },
  });

  try {
    await Jobs.broadcastAdvanceDisbursementTask({ advanceId: advance.id, ...analyticsData });
  } catch (err) {
    const formatted = ErrorHelper.logFormat(err);
    logger.error('Failed adding to advance disbursement queue', { error: formatted });
  }
}

export async function getDonationOrganizationId(
  donationInfo: DonationInfo,
  amount: number,
): Promise<number> {
  let donationOrganization = null;
  const hasValidOrganization = (Object.values(DonationOrganizationCode) as string[]).includes(
    donationInfo.donationOrganization,
  );

  const isBigMoneyAndOldAppVersion =
    !hasValidOrganization && !donationInfo.isUpdatedAppVersion && amount > 20;

  if (hasValidOrganization) {
    donationOrganization = await DonationOrganization.findOne({
      where: { code: donationInfo.donationOrganization },
    });
  } else if (donationInfo.isTreesOnlyAppVersion) {
    donationOrganization = await DonationOrganization.findOne({
      where: { code: DonationOrganizationCode.TREES },
    });
  } else if (isBigMoneyAndOldAppVersion) {
    donationOrganization = await DonationOrganization.findOne({
      where: { code: DonationOrganizationCode.UNKNOWN },
    });
  }

  return donationOrganization?.id;
}

export function verifyAdvanceAmount(amount: number): void {
  if (isNaN(amount) || amount <= 0 || amount > AdvanceApprovalClient.MAX_ADVANCE_AMOUNT) {
    throw new InvalidParametersError('Invalid advance amount');
  }
}

export function validatePaybackDate({
  deliveryType,
  advanceApproval,
  paybackDate,
  userTimezone,
}: {
  deliveryType: PaymentProviderDelivery;
  advanceApproval: AdvanceApprovalGetResponse;
  paybackDate: string;
  userTimezone: string;
}) {
  if (deliveryType === PaymentProviderDelivery.STANDARD) {
    const isPaybackDateWithinStandardDeliveryRange = (date: MomentType) =>
      date.diff(moment().startOf('day'), 'days') < MIN_REPAYBACK_DAYS_FOR_STANDARD_DELIVERY;
    const isTinyMoney = advanceApproval.microAdvanceApproved;
    const isPaybackDateChosenByUser = paybackDate != null;

    if (isTinyMoney && isPaybackDateChosenByUser) {
      if (isPaybackDateWithinStandardDeliveryRange(moment(paybackDate))) {
        throw new InvalidParametersError(
          `Standard delivery is not supported within ${MIN_REPAYBACK_DAYS_FOR_STANDARD_DELIVERY} days of payback date`,
          { customCode: CUSTOM_ERROR_CODES.ADVANCE_PAYBACK_DATE_NOT_WITHIN_RANGE },
        );
      }
    } else {
      if (isPaybackDateWithinStandardDeliveryRange(moment(advanceApproval.defaultPaybackDate))) {
        throw new InvalidParametersError(
          `Standard delivery is not supported within ${MIN_REPAYBACK_DAYS_FOR_STANDARD_DELIVERY} days of payback date`,
          { customCode: CUSTOM_ERROR_CODES.ADVANCE_PAYBACK_DATE_NOT_WITHIN_RANGE },
        );
      }
    }
  }
  const chosenPaybackDateInUserTime = moment(paybackDate || advanceApproval.defaultPaybackDate).tz(
    userTimezone,
    true,
  );
  if (chosenPaybackDateInUserTime.isSameOrBefore(moment(), 'day')) {
    throw new InvalidParametersError(`Payback Date must be in the future.`, {
      data: {
        advanceApprovalId: advanceApproval.id,
        deliveryType,
        chosenPaybackDate: chosenPaybackDateInUserTime,
        paybackDate,
        defaultPaybackDate: advanceApproval.defaultPaybackDate,
      },
    });
  }
}

async function getPaybackDate(
  advanceApproval: AdvanceApprovalGetResponse,
  explicitPaybackDate?: string,
): Promise<string> {
  if (!advanceApproval.microAdvanceApproved || !explicitPaybackDate) {
    return advanceApproval.defaultPaybackDate;
  }

  const availableDates = await getAvailableDatesForNoIncome({
    advanceApprovalId: advanceApproval.id,
  });

  if (!availableDates.includes(explicitPaybackDate)) {
    throw new InvalidParametersError(
      `Payback date ${moment(explicitPaybackDate).format('MMM D')} is no longer valid.`,
    );
  }

  return explicitPaybackDate;
}

export async function uploadScreenshot(
  screenshotContents: string | Express.Multer.File,
  userId: number,
  isOverdraft = false,
): Promise<string> {
  const identifier = `${userId}-${uuid.v4()}`;
  const directory = isOverdraft ? OVERDRAFT_SCREENSHOTS_DIRECTORY : ADVANCE_SCREENSHOTS_DIRECTORY;
  const screenshotUrl = await gcloudStorage.saveImageToGCloud(
    screenshotContents,
    directory,
    identifier,
  );
  if (!screenshotUrl) {
    throw new GoogleStorageError('Screenshot failed to upload', { gatewayService: 'node-api' });
  }
  return screenshotUrl;
}

export async function updateAdvance(
  advanceId: number,
  userId: number,
  tipPercent: number,
  source: string,
  analyticsData: AppsflyerProperties,
  screenshotContents: string | Express.Multer.File,
): Promise<void> {
  const advance = await Advance.findOne({ where: { id: advanceId }, include: [Payment] });

  if (!advance || advance.userId !== userId) {
    throw new InvalidParametersError('Cannot find advance to update');
  }

  if (advance.outstanding === 0) {
    throw new InvalidParametersError('Advance is already paid back and cannot be updated.');
  }

  if (tipPercent !== undefined) {
    const pendingPayments = advance.payments.filter(
      p => p.status === ExternalTransactionStatus.Pending,
    );

    if (!_.isEmpty(pendingPayments)) {
      throw new ConflictError('Cannot update tip while collection is in progress');
    }

    if (isNaN(tipPercent) || tipPercent < 0 || tipPercent > 50) {
      throw new InvalidParametersError(InvalidParametersMessageKey.TipPercentAmountZeroFifty);
    }

    await setTipPercent(advance, tipPercent, source, { analyticsData });

    await AuditLog.create({
      userId,
      type: 'SET_ADVANCE_TIP',
      message: `Advance tip set to ${tipPercent}`,
      successful: true,
      eventUuid: advance.id,
    });
  }

  if (screenshotContents) {
    if (advance.screenshotImage) {
      throw new InvalidParametersError('Advance already has a screenshot');
    }
    const screenshotUrl = await uploadScreenshot(screenshotContents, userId);
    await advance.update({
      screenshotImage: screenshotUrl,
    });
  }
}

export async function getAdvancePaymentMap(userId: number): Promise<{ [id: number]: Payment[] }> {
  const paymentMap = (
    await Payment.findAll({
      where: { userId },
    })
  ).reduce((acc, payment) => {
    if (!acc[payment.advanceId]) {
      acc[payment.advanceId] = [];
    }
    acc[payment.advanceId].push(payment);
    return acc;
  }, {} as { [id: number]: Payment[] });
  return paymentMap;
}

export async function checkNoExistingAdvances(userId: number) {
  // safety check to verify the user has only 1 advance out.
  const advance = await Advance.findOne({
    where: {
      userId,
      outstanding: {
        [Op.gt]: 0,
      },
    },
  });
  if (advance) {
    dogstatsd.increment('advance_disbursement.has_outstanding_advance');
    throw new InvalidParametersError(InvalidParametersMessageKey.OneAdvanceAtATime, {
      customCode: CUSTOM_ERROR_CODES.ADVANCE_ONE_AT_A_TIME,
    });
  }
}

export async function getAdvancesByUser(userId: number): Promise<Advance[]> {
  const { Canceled, Returned } = ExternalTransactionStatus;

  const advances = await Advance.findAll({
    where: {
      userId,
      disbursementStatus: {
        [Op.notIn]: [Canceled, Returned],
      },
    },
    include: [
      AdvanceExperimentLog,
      { model: BankAccount, paranoid: false },
      { model: AdvanceTip, include: [DonationOrganization] },
    ],
  });
  return advances;
}
