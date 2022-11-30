import * as sinon from 'sinon';
import { SinonSandbox, SinonStub } from 'sinon';
import { BalanceLogCaller, RecurringTransactionStatus } from '../../src/typings';
import * as MachineLearning from '../../src/services/advance-approval/machine-learning';
import * as MachineLearningDomain from '../../src/domain/machine-learning';
import { BankAccount, BankTransaction, RecurringTransaction, User } from '../../src/models';
import { SOLVENCY_AMOUNT } from '../../src/services/advance-approval/advance-approval-engine';
import factory from '../factories';
import { moment, Moment } from '@dave-inc/time-lib';
import { UnderwritingModelType } from '../../src/lib/oracle';
import { backfillDailyBalances } from '../../src/domain/banking-data-sync';
import { upsertBalanceLogForStubs } from './stub-balance-log-client';
import { BankingDataSource } from '@dave-inc/wire-typings';

export function stubUnderwritingML(
  sandbox: SinonSandbox,
  {
    score,
    modelType,
    error,
    stub,
  }: { score?: number; modelType?: UnderwritingModelType; error?: Error; stub?: SinonStub },
) {
  stub = stub || sandbox.stub(MachineLearning, 'getUnderwritingMlScore');

  const requestBody = modelType ? sinon.match({ modelType }) : sinon.match.any;
  const config = sinon.match.object;

  if (error) {
    stub = stub.withArgs(requestBody, config).throws(error);
  } else {
    stub = stub.withArgs(requestBody, config).resolves({ score });
  }

  return stub;
}

export function stubPredictedPaybackML(
  sandbox: SinonSandbox,
  {
    predictionDate,
    error,
  }: {
    predictionDate: Moment;
    error?: Error;
  } = { predictionDate: null },
) {
  const stub = sandbox.stub(MachineLearningDomain, 'predictPaybackDate');

  stub.resolves(predictionDate);

  return stub;
}

export async function buildIntegrationTestUser({
  failedIncomeValidation = false,
  hasLowIncome = false,
  isNewAccount = false,
  failedSolvency = false,
  failedSolvencyValue = 10,
  hasPreviousAdvance = true,
  isBodBankAccount = false,
  user,
  bankAccount,
}: {
  failedIncomeValidation?: boolean;
  hasLowIncome?: boolean;
  isNewAccount?: boolean;
  failedSolvency?: boolean;
  failedSolvencyValue?: number;
  hasPreviousAdvance?: boolean;
  isBodBankAccount?: boolean;
  user?: User;
  bankAccount?: BankAccount;
} = {}): Promise<{
  user: User;
  bankAccount: BankAccount;
  recurringTransaction: RecurringTransaction;
}> {
  const balance = SOLVENCY_AMOUNT + 100;

  if (!bankAccount || !user) {
    bankAccount = await factory.create(
      isBodBankAccount ? 'bod-checking-account' : 'checking-account',
      {
        current: balance,
        available: balance,
        userId: user?.id,
      },
    );

    user = await bankAccount.getUser();
  }

  const recurringTransaction: RecurringTransaction = await factory.create('recurring-transaction', {
    bankAccountId: bankAccount.id,
    userId: bankAccount.userId,
    userAmount: SOLVENCY_AMOUNT + 10,
    interval: 'MONTHLY',
    status: failedIncomeValidation
      ? RecurringTransactionStatus.NOT_VALIDATED
      : RecurringTransactionStatus.VALID,
    params: [
      moment()
        .add(3, 'days')
        .date() >= 28
        ? -1
        : moment()
            .add(3, 'days')
            .date(),
    ],
  });

  // create last income
  const income: BankTransaction = await factory.create('bank-transaction', {
    bankAccountId: bankAccount.id,
    userId: bankAccount.userId,
    displayName: recurringTransaction.transactionDisplayName,
    amount: hasLowIncome ? 100 : SOLVENCY_AMOUNT + 100,
    transactionDate: recurringTransaction.rsched.before(moment()),
  });

  // create oldest transaction
  await factory.create('bank-transaction', {
    bankAccountId: bankAccount.id,
    userId: bankAccount.userId,
    amount: -10,
    transactionDate: isNewAccount ? moment().subtract(3, 'days') : moment().subtract(120, 'days'),
  });

  await backfillDailyBalances(bankAccount, BalanceLogCaller.BinDevSeed);
  if (failedSolvency) {
    let currentDate = moment(income.transactionDate).subtract(1, 'day');
    const endDate = moment(income.transactionDate).add(4, 'days');
    while (currentDate <= endDate) {
      upsertBalanceLogForStubs({
        date: currentDate.format('YYYY-MM-DD'),
        processorAccountId: bankAccount.externalId,
        bankAccountId: bankAccount.id,
        processorName: BankingDataSource.Plaid,
        bankConnectionId: bankAccount.bankConnectionId,
        userId: bankAccount.userId,
        current: failedSolvencyValue,
        available: failedSolvencyValue,
      });
      currentDate = currentDate.add(1, 'day');
    }
  }

  if (hasPreviousAdvance && (await user.getAdvances()).length === 0) {
    await factory.create('advance', {
      bankAccountId: bankAccount.id,
      userId: user.id,
      amount: 75,
      outstanding: 0,
      createdDate: moment().subtract(1, 'day'),
    });
  }

  return { user, bankAccount, recurringTransaction };
}
