import * as Bluebird from 'bluebird';

import { BankAccountComplexResponse, IncomeResponse } from '@dave-inc/wire-typings';

import { BankAccount, AdminPaycheckOverride, BankConnectionTransition } from '../models';
import { getLocalTime } from '../domain/user-setting';
import HeathClient from '../lib/heath-client';
import * as Forecast from '../domain/forecast';
import * as RecurringTransactionDomain from '../domain/recurring-transaction';
import { get } from 'lodash';

export async function serializeBankAccount(
  account: BankAccount,
  { showAvailableToSpend = false }: { showAvailableToSpend?: boolean } = {},
): Promise<BankAccountComplexResponse> {
  const today = await getLocalTime(account.userId);
  const {
    institution,
    paymentMethod,
    connection,
    numTransactions,
    forecast,
    expected,
    isCurrentlyDetectingIncome,
    override,
    bankConnectionTransition,
  } = await Bluebird.props({
    institution: account.institution || account.getInstitution(),
    paymentMethod: account.defaultPaymentMethod || account.getDefaultPaymentMethod(),
    connection: account.bankConnection || account.getBankConnection(),
    numTransactions: HeathClient.countBankTransactions(account.id),
    forecast: Forecast.computeAccountForecast(account, {
      startFromPayPeriod: showAvailableToSpend,
    }),
    expected: RecurringTransactionDomain.getNextExpectedPaycheckForAccount(
      account.id,
      account.mainPaycheckRecurringTransactionId,
      today,
    ),
    isCurrentlyDetectingIncome: RecurringTransactionDomain.isInitialIncomeDetectionActive(
      account.id,
      account.created,
    ),
    override: AdminPaycheckOverride.getNextPaycheckOverrideForAccount(account.id),
    bankConnectionTransition: BankConnectionTransition.getByToBankAccountId(account.id),
  });

  let approval: {
    incomeNeeded: boolean;
    income: IncomeResponse;
    isSupportOverride: boolean;
  } = {
    incomeNeeded: true,
    income: null,
    isSupportOverride: false,
  };

  if (expected) {
    approval = {
      incomeNeeded: false,
      income: expected && {
        date: expected.expectedDate.format('YYYY-MM-DD'),
        amount: expected.expectedAmount,
        displayName: expected.displayName,
      },
      isSupportOverride: false,
    };
  } else if (override) {
    approval = {
      incomeNeeded: false,
      income: {
        date: override.payDate.format('YYYY-MM-DD'),
        amount: override.amount,
        displayName: 'Support Override',
      },
      isSupportOverride: true,
    };
  }

  const canMicroDepositManualVerification = await account.isReadyForMicroDepositManualVerification();

  return {
    id: account.id,
    displayName: account.displayName,
    lastFour: account.lastFour,
    externalId: account.externalId,
    hasAccountRouting: account.hasAccountRouting,
    bankConnectionId: account.bankConnectionId,
    hasValidCredentials: connection.hasValidCredentials,
    // Some banks such as Chime do not return available,
    // Fallback to current in those cases.
    available: account.available || account.current,
    current: account.current,
    microDeposit: account.microDeposit,
    microDepositManualVerification: canMicroDepositManualVerification,
    numTransactions,
    institution: {
      id: institution.id,
      displayName: institution.displayName,
      logo: institution.logo,
      primaryColor: institution.primaryColor,
    },
    paymentMethod: paymentMethod && {
      id: paymentMethod.id,
      displayName: paymentMethod.displayName,
      scheme: paymentMethod.scheme,
      mask: paymentMethod.mask,
      expiration: paymentMethod.expiration.format('YYYY-MM'),
      invalid: paymentMethod.invalid ? paymentMethod.invalid.toJSON() : null,
      optedIntoDaveRewards: paymentMethod.optedIntoDaveRewards,
      empyrCardId: paymentMethod.empyrCardId,
      zipCode: paymentMethod.zipCode,
    },
    approval,
    preApprovalWaitlist: !!account.preApprovalWaitlist,
    hasReceivedTransactions: connection.hasTransactions,
    isCurrentlyDetectingIncome,
    mainPaycheckRecurringTransactionId: account.mainPaycheckRecurringTransactionId,
    // TODO(melvin): need to add mainPaycheckRecurringTransactionUuid
    forecast,
    deleted: account.deleted ? account.deleted.toJSON() : null,
    bankingDataSource: connection.bankingDataSource,
    hasReceivedFirstPaycheck: get(bankConnectionTransition[0], 'hasReceivedFirstPaycheck', null),
  };
}
