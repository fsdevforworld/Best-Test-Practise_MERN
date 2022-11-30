import { MembershipPause } from '../models';

export type MembershipPauseResult = {
  success: boolean;
  msg?: string;
  membershipPause?: MembershipPause;
  interpolations?: { [key: string]: string | number };
};
