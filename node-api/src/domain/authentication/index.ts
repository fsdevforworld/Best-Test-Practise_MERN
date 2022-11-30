import { IDaveRequest } from '../../typings';

type LegacyAuthTokenHeader = { Authorization: string };
type AccessTokenHeader = { 'X-Access-Token': string };
type AuthorizationHeader = LegacyAuthTokenHeader | AccessTokenHeader;

export const getAuthenticationHeader = (req: IDaveRequest): AuthorizationHeader | null => {
  const accessToken = req.get('X-Access-Token');
  const sessionCookie = req.signedCookies?.user;
  const legacyAuthToken = req.get('Authorization') || sessionCookie?.authorization;
  const deviceId = req.get('X-Device-Id') || sessionCookie?.deviceId;

  if (accessToken) {
    return { 'X-Access-Token': accessToken };
  } else if (legacyAuthToken && deviceId) {
    const encodedToken = Buffer.from(`${deviceId}:${legacyAuthToken}`).toString('base64');
    const authorizationToken = `Basic ${encodedToken}`;
    return { Authorization: authorizationToken };
  } else {
    return null;
  }
};
