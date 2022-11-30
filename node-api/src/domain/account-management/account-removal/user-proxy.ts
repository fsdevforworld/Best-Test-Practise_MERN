import { BankConnection, User } from '../../../models';

export function getBankConnections(user: User): BankConnection[] {
  return user.bankConnections;
}
