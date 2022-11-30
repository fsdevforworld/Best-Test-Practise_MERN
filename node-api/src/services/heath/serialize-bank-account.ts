import { BankAccount, BankConnection } from '../../models';
import { InvalidParametersError } from '@dave-inc/error-types';

export async function serializeBankAccount(
  bankAccount: BankAccount,
  bankConnection?: BankConnection,
) {
  bankConnection = bankConnection || (await bankAccount.getBankConnection({ useMaster: true }));
  if (!bankConnection) {
    throw new InvalidParametersError('Bank connection not found');
  }

  return {
    id: bankAccount.id,
    bankConnectionId: bankAccount.bankConnectionId,
    current: bankAccount.current,
    isDaveBanking: bankConnection.isDaveBanking(),
    microDepositComplete: bankAccount.microDepositComplete(),
    hasValidCredentials: bankConnection.hasValidCredentials,
    initialPull: bankConnection.initialPull?.format(),
    mainPaycheckRecurringTransactionId: bankAccount.mainPaycheckRecurringTransactionId,
  };
}
