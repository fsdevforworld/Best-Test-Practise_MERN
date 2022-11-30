import {
  isCashDeposit,
  isLoanDeposit,
} from '../recurring-transaction/validate-recurring-transaction';

export function isSupportedIncome(transactionName: string, amount: number): boolean {
  return (
    amount > 0 && !isLoanDeposit(transactionName, amount) && !isCashDeposit(transactionName, amount)
  );
}
