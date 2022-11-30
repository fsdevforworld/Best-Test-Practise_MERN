import { isNil } from 'lodash';
import { Op } from 'sequelize';
import { Moment } from 'moment';
import { AuditLog, BankAccount, PaymentMethod, User } from '../../../models';

import { getParams, validateZipCode } from '../../../lib/utils';
import { InvalidCredentialsError, InvalidParametersError, NotFoundError } from '../../../lib/error';
import { dogstatsd } from '../../../lib/datadog-statsd';
import { moment } from '@dave-inc/time-lib';
import { formatOwner, verifyCard } from '../../../lib/tabapay';

import * as PaymentMethodDomain from '../../../domain/payment-method';
import { deleteEmpyrCard } from '../../../domain/rewards';

import { TabapayAccountOwnerParam } from '@dave-inc/loomis-client';

import {
  ForbiddenMessageKey,
  InvalidParametersMessageKey,
  NotFoundMessageKey,
} from '../../../translations';

const GREEN_DOT_BINS = [
  '425031',
  '425032',
  '437303',
  '437306',
  '437309',
  '498403',
  '519285',
  '527368',
  '527395',
  '528852',
  '530048',
];

type PaymentMethodCreateParams = {
  user: User;
  bankAccountId: number;
  keyId: string;
  encryptedCardData: string;
  bin: string;
  mask: string;
  expirationMonth: string;
  expirationYear: string;
  zipCode: string;
  optedIntoDaveRewards: boolean;
};

// [BIN, institutionId] combination that is exempt from the card type mismatch error
const CARD_TYPE_MISMATCH_WHITELIST: { [key: string]: number } = {
  511361: 268346,
  440393: 104812,
  403995: 268346,
  403905: 268346,
  414397: 269412,
  485320: 269154,
  531108: 268346,
  533248: 104812,
};

export async function createPaymentMethod({
  user,
  bankAccountId,
  keyId,
  encryptedCardData,
  bin,
  mask,
  expirationMonth,
  expirationYear,
  zipCode,
  optedIntoDaveRewards,
}: PaymentMethodCreateParams): Promise<PaymentMethod> {
  const expirationDate = moment(`${expirationMonth}${expirationYear}`, 'MMYYYY');
  const matchAccount = await BankAccount.findByPk(bankAccountId);

  validateCreateData(matchAccount, user.id, expirationDate, bin, zipCode);

  const cardOwner = formatOwner(user);
  const verification = await verifyCard(encryptedCardData, keyId, cardOwner, user);

  /*
    2019-12-05: Walmart/Green Dot account subtype is CHECKING, but
    Tabapay says the card type is PREPAID.
  */
  if (
    matchAccount.institutionId !== CARD_TYPE_MISMATCH_WHITELIST[bin] &&
    matchAccount.institutionId !== 264064 &&
    verification.type === 'prepaid' &&
    matchAccount.subtype !== 'PREPAID' &&
    matchAccount.subtype !== 'PREPAID_DEBIT'
  ) {
    dogstatsd.increment('payment_method.create_error.card_type_mismatch', {
      bin,
      institution_id: `${matchAccount.institutionId}`,
      verification_type: verification.type,
      match_account_subtype: matchAccount.subtype,
    });
    throw new InvalidParametersError(InvalidParametersMessageKey.CardTypeAccountType, {
      data: {
        bin,
        institutionId: matchAccount.institutionId,
        verificationType: verification.type,
        matchAccountSubtype: matchAccount.subtype,
      },
    });
  }

  const returnMethod = await PaymentMethodDomain.addCard({
    encryptedCard: encryptedCardData,
    keyId,
    bankAccount: matchAccount,
    mask,
    bin,
    expirationDate,
    zipCode,
    optedIntoDaveRewards,
    availability: verification.availability,
    avsLogId: verification.avsLogId,
  });

  // Check if user is linked to a rewards program and sever connection if so
  const empyrPaymentMethodId = await findEmpyrPaymentMethodId(user.id);
  if (empyrPaymentMethodId) {
    await deleteEmpyrCard(user, empyrPaymentMethodId);
  }

  await matchAccount.update({ defaultPaymentMethodId: returnMethod.id });

  dogstatsd.increment('payment_method.create_success', {
    bin,
    institution_id: `${matchAccount.institutionId}`,
    verification_type: verification.type,
    match_account_subtype: matchAccount.subtype,
  });

  await AuditLog.create({
    userId: user.id,
    type: 'PAYMENT_METHOD_CREATE',
    message: `Payment Method created: ${returnMethod.displayName}`,
    successful: true,
    eventUuid: returnMethod.id,
  });

  return returnMethod;
}

function validateCreateData(
  matchAccount: BankAccount,
  userId: number,
  expirationDate: Moment,
  bin: string,
  zipCode: string,
): void {
  if (!expirationDate.isValid() || expirationDate < moment().add(2, 'months')) {
    throw new InvalidParametersError(InvalidParametersMessageKey.CardThreeMonthValidity);
  }

  if (!matchAccount || matchAccount.userId !== userId) {
    throw new InvalidParametersError(InvalidParametersMessageKey.MissingBankAccountId);
  }

  // Chime
  if (matchAccount.institutionId !== 104812 && /^423223/.test(bin)) {
    throw new InvalidParametersError(InvalidParametersMessageKey.Card23);
  }

  // Walmart/Greendot
  if (matchAccount.institutionId !== 264064 && GREEN_DOT_BINS.includes(bin)) {
    throw new InvalidParametersError(InvalidParametersMessageKey.Card24);
  }

  if (zipCode && !validateZipCode(zipCode)) {
    throw new InvalidParametersError(InvalidParametersMessageKey.InvalidZipCodeEntry);
  }
}

async function findEmpyrPaymentMethodId(userId: number): Promise<number> {
  const paymentMethod: PaymentMethod = await PaymentMethod.findOne({
    where: {
      userId,
      empyrCardId: {
        [Op.ne]: null,
      },
    },
  });

  return paymentMethod ? paymentMethod.id : null;
}

export async function updatePaymentMethod(
  user: User,
  paymentMethodId: number,
  empyrCardId: number,
  empyrUserId: number,
  optedIntoDaveRewards: boolean,
): Promise<void> {
  const paymentMethod = await PaymentMethod.findByPk(paymentMethodId);

  validateUpdateData(paymentMethod, user.id, empyrCardId, empyrUserId, optedIntoDaveRewards);

  await Promise.all([
    paymentMethod.update({
      empyrCardId,
      optedIntoDaveRewards: isNil(optedIntoDaveRewards)
        ? paymentMethod.optedIntoDaveRewards
        : optedIntoDaveRewards,
    }),
    user.update({
      empyrUserId,
    }),
  ]);
}

function validateUpdateData(
  paymentMethod: PaymentMethod,
  userId: number,
  empyrCardId: number,
  empyrUserId: number,
  optedIntoDaveRewards: boolean,
): void {
  if (!paymentMethod) {
    throw new NotFoundError(NotFoundMessageKey.PaymentMethodPatchNotFound);
  }

  // Verify that the current user owns the payment method that they are trying to update
  if (userId !== paymentMethod.userId) {
    throw new InvalidCredentialsError(ForbiddenMessageKey.PaymentMethodPatchForbidden);
  }

  if (!empyrCardId || !empyrUserId) {
    throw new InvalidParametersError('Error patching payment method', {
      required: ['empyrCardId', 'empyrUserId'],
      provided: Object.keys({ empyrCardId, empyrUserId, optedIntoDaveRewards }),
    });
  }
}

type TabapayCardPayload = {
  keyId: string;
  encryptedCardData: string;
  owner: TabapayAccountOwnerParam;
};

export function getTabapayCardPayload(card: {
  tabapayEncryptedCard: TapapayEncryptedCard;
  firstName: string;
  lastName: string;
  zipCode: string;
}): TabapayCardPayload {
  const { tabapayEncryptedCard, firstName, lastName, zipCode } = getParams(card, [
    'tabapayEncryptedCard',
    'firstName',
    'lastName',
    'zipCode',
  ]);
  const { keyId, encryptedCardData } = getTabapayEncryptedCardPayload(tabapayEncryptedCard);

  return {
    keyId,
    encryptedCardData,
    owner: {
      name: {
        first: firstName,
        last: lastName,
      },
      address: {
        zipcode: zipCode,
      },
    },
  };
}

type TapapayEncryptedCard = {
  keyId: string;
  encryptedCardData: string;
  referenceId?: string;
};

export function getTabapayEncryptedCardPayload(
  encryptedCard: TapapayEncryptedCard,
): TapapayEncryptedCard {
  const required = ['encryptedCardData', 'keyId'];
  return getParams(encryptedCard, required);
}
