import { Moment } from 'moment';
import {
  BankAccount as BankAccountLoomis,
  encodePaymentMethodId,
  PaymentMethod as PaymentMethodLoomis,
  PaymentMethodType,
} from '@dave-inc/loomis-client';
import { moment } from '@dave-inc/time-lib';
import { BankAccount, PaymentMethod } from '../models';
import { isNil } from 'lodash';

export type PaymentSource = {
  bankAccount: BankAccount;
  debitCard?: PaymentMethodLoomis;
};

function formatDate(date: Moment | Date): Date {
  if (date) {
    return moment(date).toDate();
  } else {
    return null;
  }
}

export function paymentMethodModelToType(paymentMethod: PaymentMethod): PaymentMethodLoomis {
  const {
    id,
    bankAccount,
    bankAccountId,
    userId,
    availability,
    bin,
    created,
    deleted,
    displayName,
    expiration,
    empyrCardId,
    invalid,
    invalidReasonCode,
    mask,
    optedIntoDaveRewards,
    linked,
    tabapayId,
    risepayId,
    scheme,
    updated,
    zipCode,
  } = paymentMethod;
  const type = PaymentMethodType.DEBIT_CARD;

  const result: PaymentMethodLoomis = {
    id,
    validAchAccount: false,
    type,
    universalId: encodePaymentMethodId({ type, id }),
    bankAccountId,
    userId,
    availability,
    bin,
    created: formatDate(created),
    deleted: formatDate(deleted),
    displayName,
    expiration: formatDate(expiration),
    empyrCardId,
    invalid: formatDate(invalid),
    invalidReasonCode,
    isDaveBanking: false,
    isPrimary: false,
    mask,
    optedIntoDaveRewards,
    linked,
    tabapayId,
    risepayId,
    scheme,
    updated: formatDate(updated),
    zipCode,
  };

  if (!isNil(bankAccount)) {
    result.bankAccount = bankAccountModelToType(bankAccount);
  }

  return result;
}

// TODO: When we update to latest loomis client, we can fix the return type
export async function bankAccountModelToPaymentMethod(
  bankAccount: BankAccount,
): Promise<PaymentMethodLoomis & { lastFour: string; primaryDebitCardId: number }> {
  //TODO: When Tivan handles Dave Banking accounts separately from ACH accounts, "type" should be DAVE_BANKING
  const type = PaymentMethodType.BANK_ACCOUNT;
  const bankConnection =
    bankAccount.bankConnection || (await bankAccount.getBankConnection({ paranoid: false }));
  const isDaveBanking = bankConnection.isDaveBanking();

  return {
    id: bankAccount.id,
    bankAccountId: bankAccount.id,
    bankAccount: bankAccountModelToType(bankAccount),
    primaryDebitCardId: bankAccount.defaultPaymentMethodId,
    userId: bankAccount.userId,
    lastFour: bankAccount.lastFour,
    availability: '',
    bin: '',
    created: bankAccount.created?.toDate(),
    deleted: bankAccount.deleted?.toDate(),
    displayName: bankAccount.displayName,
    expiration: new Date(9999, 12, 31),
    empyrCardId: null,
    invalid: null,
    invalidReasonCode: null,
    isDaveBanking: await bankAccount.isDaveBanking(),
    mask: bankAccount.lastFour,
    optedIntoDaveRewards: false,
    linked: '',
    tabapayId: null,
    risepayId: bankAccount.risepayId,
    scheme: '',
    updated: bankAccount.updated?.toDate(),
    zipCode: '',
    type,
    validAchAccount: true,
    universalId: encodePaymentMethodId({
      type: isDaveBanking ? PaymentMethodType.DAVE_BANKING : type,
      id: bankAccount.id,
    }),
    isPrimary: bankConnection.primaryBankAccountId === bankAccount.id,
  };
}

function bankAccountModelToType(bankAccount: BankAccount): BankAccountLoomis {
  return {
    institutionId: bankAccount.institutionId,
    lastFour: bankAccount.lastFour,
    externalId: bankAccount.externalId,
  } as BankAccountLoomis;
}
