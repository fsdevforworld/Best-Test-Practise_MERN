import { BankConnectionTransition } from '../../models';
import { RecurringTransactionStatus, TransactionType } from '../../typings';
import { getById } from '../recurring-transaction';
import AdvanceApprovalClient from '../../lib/advance-approval-client';

export class DetectFirstRecurringPaycheckError extends Error {
  constructor(public reason: DetectFirstRecurringPaycheckErrorReason, public data?: any) {
    super('Did not detect a first recurring paycheck');
  }
}

export enum DetectFirstRecurringPaycheckErrorReason {
  BANK_CONNECTION_NOT_ELIGIBLE = 'bank_connection_not_eligible',
  LOST_UPDATE_RACE = 'lost_sql_update_race',
  NO_BANK_CONNECTION_TRANSITION = 'no_bank_connection_transition',
  RECURRING_TRANSACTION_NOT_ELIGIBLE = 'recurring_transaction_not_eligible',
  TYPE_NOT_INCOME = 'type_not_income',
}

type Params = {
  recurringTransactionId: number;
  type: TransactionType;
};

export async function detectFirstRecurringPaycheck({
  recurringTransactionId,
  type,
}: Params): Promise<void> {
  if (type !== TransactionType.INCOME) {
    // Saves us a trip to the database.
    throw new DetectFirstRecurringPaycheckError(
      DetectFirstRecurringPaycheckErrorReason.TYPE_NOT_INCOME,
      { type },
    );
  }

  const recurringTransaction = await getById(recurringTransactionId);

  if (
    !recurringTransaction ||
    recurringTransaction.status !== RecurringTransactionStatus.VALID ||
    recurringTransaction.type !== TransactionType.INCOME ||
    recurringTransaction.userAmount < AdvanceApprovalClient.MINIMUM_PAYCHECK_AMOUNT ||
    Boolean(recurringTransaction.missed)
  ) {
    throw new DetectFirstRecurringPaycheckError(
      DetectFirstRecurringPaycheckErrorReason.RECURRING_TRANSACTION_NOT_ELIGIBLE,
      {
        isMissed: recurringTransaction ? Boolean(recurringTransaction.missed) : undefined,
        status: recurringTransaction?.status,
        type: recurringTransaction?.type,
        userAmount: recurringTransaction?.userAmount,
      },
    );
  }

  const { bankAccountId } = recurringTransaction;

  const bankConnectionTransitions = await BankConnectionTransition.getByToBankAccountId(
    recurringTransaction.bankAccountId,
  );

  if (bankConnectionTransitions.length === 0) {
    // Bank of Dave BankConnections always have this transition row.
    throw new DetectFirstRecurringPaycheckError(
      DetectFirstRecurringPaycheckErrorReason.NO_BANK_CONNECTION_TRANSITION,
    );
  }

  if (bankConnectionTransitions.length > 1) {
    throw new Error(
      `BankAccount ${bankAccountId} has ${bankConnectionTransitions.length} BankConnectionTransitions`,
    );
  }

  const [{ hasReceivedFirstPaycheck, id, toBankConnection }] = bankConnectionTransitions;
  const isDaveBanking = toBankConnection.isDaveBanking();

  if (!isDaveBanking || hasReceivedFirstPaycheck) {
    throw new DetectFirstRecurringPaycheckError(
      DetectFirstRecurringPaycheckErrorReason.BANK_CONNECTION_NOT_ELIGIBLE,
      { hasReceivedFirstPaycheck, isDaveBanking },
    );
  }

  const params: Partial<BankConnectionTransition> = {
    hasReceivedFirstPaycheck: true,
    hasReceivedRecurringPaycheck: true,
  };

  const [rowsUpdated] = await BankConnectionTransition.update(params, {
    where: { hasReceivedFirstPaycheck: false, id },
  });

  if (rowsUpdated !== 1) {
    // Multiple paychecks could arrive at once.
    throw new DetectFirstRecurringPaycheckError(
      DetectFirstRecurringPaycheckErrorReason.LOST_UPDATE_RACE,
      { rowsUpdated },
    );
  }
}
