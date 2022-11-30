import { User } from '../../../models';

export enum CoreAccountStatus {
  FRAUD,
  ACTIVE,
  DELETED,
}
type Active = { status: CoreAccountStatus.ACTIVE };
type Fraud = { status: CoreAccountStatus.FRAUD };
type Deleted = { status: CoreAccountStatus.DELETED };
export type CoreAccountStatusResult = Active | Fraud | Deleted;

export async function getCoreAccountStatus(userId: number): Promise<CoreAccountStatusResult> {
  const user: User | null = await User.findByPk(userId);
  if (!user) {
    return { status: CoreAccountStatus.DELETED };
  } else if (user.fraud) {
    return { status: CoreAccountStatus.FRAUD };
  } else {
    return { status: CoreAccountStatus.ACTIVE };
  }
}
