import {
  PossibleRecurringTransactionResponse,
  RecurringTransactionResponse,
  AdvanceTermsResponse,
  BankAccountComplexResponse,
} from '@dave-inc/wire-typings';

import { BankConnectType } from 'actions/bank-connection';
import { SubmitRecurringIncomeType, DetectPaychecksType } from 'actions/transactions';
import { AdvanceTermsType } from 'actions/advances';
import { SubmitOnboardingStepType } from 'actions/onboarding';

import * as Analytics from 'lib/analytics';
import { CUSTOM_ERROR_CODES } from 'lib/error';

export const selectAccountsWithAccountAndRouting = (
  accounts: BankAccountComplexResponse[],
): BankAccountComplexResponse[] => {
  return accounts.filter((account) => account.hasAccountRouting);
};

export const selectAccountsWithNonSavings = (
  accounts: BankAccountComplexResponse[],
): BankAccountComplexResponse[] => {
  return accounts.filter((account) => account.displayName.toLowerCase().indexOf('savings') === -1);
};

async function delay(ms: number) {
  let delayResolve: (value?: {} | PromiseLike<{}>) => void;
  const delayProimse = new Promise((resolve) => {
    delayResolve = resolve;
  });
  setTimeout(() => {
    delayResolve();
  }, ms);
  return delayProimse;
}

type CompleteOnboardingProps = {
  institutionName: string;
  institutionId: string;
  plaidToken: string;
  bankConnect: BankConnectType;
  detectPaychecks: DetectPaychecksType;
  submitRecurringIncome: SubmitRecurringIncomeType;
  advanceTerms: AdvanceTermsType;
  submitOnboardingStep: SubmitOnboardingStepType;
  isPlaidUpdateMode?: boolean;
};

type CompleteOnboardingStepResponse = {
  step: number;
  done: boolean;
  isApproved?: boolean;
};

export async function* completeOnboardingSteps({
  institutionName,
  institutionId,
  plaidToken,
  bankConnect,
  detectPaychecks,
  submitRecurringIncome,
  advanceTerms,
  submitOnboardingStep,
  isPlaidUpdateMode = false,
}: CompleteOnboardingProps) {
  yield { step: 0, done: false } as CompleteOnboardingStepResponse;

  const accounts = await bankConnect({
    externalInstitutionId: institutionId,
    plaidToken,
    isPlaidUpdateMode,
  });
  Analytics.trackEvent(Analytics.EVENTS.BANK_CONNECTED, {
    bank_name: institutionName,
    institution_id: institutionId,
  });
  yield { step: 1, done: false } as CompleteOnboardingStepResponse;

  // MVP website only supports accounts with account and routing information
  const filteredAccounts = selectAccountsWithAccountAndRouting(accounts);
  if (!filteredAccounts.length) {
    // eslint-disable-next-line no-throw-literal
    throw {
      response: { data: { customCode: CUSTOM_ERROR_CODES.MICRODEPOSIT_REQUIRED_ERROR_CODE } },
    };
  }

  const detectPaychecksPromises: Promise<PossibleRecurringTransactionResponse[]>[] = [];
  const addIncomePromises: Promise<RecurringTransactionResponse[]>[] = [];
  const getAdvanceTermsPromises: Promise<AdvanceTermsResponse[]>[] = [];

  // We need this delay to allow time for transactions to come back from Plaid
  await delay(10000);

  // MVP website only checks advance approval status.
  // The mobile application allows the user to select the default account and has the user manually enter expenses and income
  // For the web application the user does not select the default account, so we iterate through all accounts
  // We also only care if ANY accounts give advance approval, and because of this we do not need to wait for ALL all accounts if one is approved
  // You'll see this reflected with Promise.race and yield statements below
  filteredAccounts.forEach(async (account) => {
    // detect paychecks
    const bankAccountId = account.id;
    const getPaychecks = detectPaychecks(bankAccountId);
    detectPaychecksPromises.push(getPaychecks);
    // add income
    const addIncome = getPaychecks.then((paychecks) => {
      return Promise.all(
        paychecks.map((paycheck) => {
          const { interval, params, rollDirection, bankTransactionId } = paycheck;
          return submitRecurringIncome({
            bankAccountId,
            interval,
            params,
            bankTransactionId,
            rollDirection,
          });
        }),
      );
    });
    addIncomePromises.push(addIncome);
    // get advance terms
    const getAdvanceTerms = addIncome.then(() => advanceTerms(bankAccountId));
    getAdvanceTermsPromises.push(getAdvanceTerms);
  });

  await Promise.race(detectPaychecksPromises);
  Analytics.trackEvent(Analytics.EVENTS.ONBOARDING_TRANSACTION_DATA_ANALYZED);
  yield { step: 2, done: false } as CompleteOnboardingStepResponse;

  await Promise.race(addIncomePromises);
  Analytics.trackEvent(Analytics.EVENTS.INCOME_ADDED_SUCCESS);
  yield { step: 3, done: false } as CompleteOnboardingStepResponse;

  // For MVP the only thing we can do is see if we are approved for an advance
  // AFTER MVP, we will move this check into the user dashboard
  const terms = await Promise.all(getAdvanceTermsPromises);
  const isApproved =
    terms.filter((incomeDetails) => {
      return incomeDetails.filter((termsOf) => termsOf.approved).length > 0;
    }).length > 0;
  Analytics.trackEvent(Analytics.EVENTS.ONBOARDING_ADVANCE_TERMS_RETRIEVED, {
    isApproved,
  });

  if (filteredAccounts.length === 1) {
    submitOnboardingStep('SelectAccount');
  }

  submitOnboardingStep('AddDebitCard');
  submitOnboardingStep('Expense');

  await delay(300); // small delay so transition isn't jarring to the user
  yield { step: 3, done: true, isApproved } as CompleteOnboardingStepResponse;
}
