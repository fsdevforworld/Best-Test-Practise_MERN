import * as sinon from 'sinon';
import { OAuth2Client, LoginTicket } from 'google-auth-library';

export default function stubGoogleAuth(
  email: string,
  {
    hd = 'dave.com',
    aud = 'aud',
    sub = 'sub',
    iss = 'iss',
    iat = 1514162443,
    exp = 1514166043,
    sandbox = sinon.createSandbox(),
  }: {
    hd?: string;
    aud?: string;
    sub?: string;
    iss?: string;
    iat?: number;
    exp?: number;
    sandbox?: sinon.SinonSandbox;
  } = {},
) {
  const ticket = new LoginTicket('c', {
    hd,
    email,
    aud,
    sub,
    iss,
    iat,
    exp,
  });

  const idToken = Math.random()
    .toString(36)
    .substring(7);

  const spy = sandbox
    .stub(OAuth2Client.prototype, 'verifyIdToken')
    .withArgs(sinon.match({ idToken, audience: sinon.match.string }))
    .resolves(ticket);

  return { idToken, spy, sandbox };
}
