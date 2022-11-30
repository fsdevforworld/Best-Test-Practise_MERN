import { isDevEnv } from '../../lib/utils';

export default function getEmpyrUserToken(userId: number): string {
  let suffix = 'dave.com';

  // The 'mogl' needs to be in the user token for the test environment, Empyr requires this
  if (isDevEnv()) {
    suffix = `mogl-${suffix}`;
  }

  const token = `${userId}-dave-user@${suffix}`;
  return token;
}
