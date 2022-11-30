import { SombraConfig } from '../../src/services/sombra/config';
import * as uuid from 'uuid';
import * as jwt from 'jsonwebtoken';

export const SOMBRA_KEY_ID = '1';

export const SOMBRA_PUBLIC_KEY: string = SombraConfig.devPublicKey();

export const SOMBRA_PRIVATE_KEY: string = SombraConfig.devPrivateKey();

export const SOMBRA_BAD_PRIVATE_KEY = `-----BEGIN RSA PRIVATE KEY-----
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
-----END RSA PRIVATE KEY-----`;

const UTC_MILLI_OFFSET = new Date().getTimezoneOffset() * 60 * 1000;

function nowUTCEpochSeconds(): number {
  return Math.floor((new Date().getTime() + UTC_MILLI_OFFSET) / 1000);
}

export function generateToken(userId: number, duration: number = 10 * 60): string {
  const iat = nowUTCEpochSeconds();
  const exp = iat + duration;
  const tokenId = uuid.v4();
  const payload = { sub: userId, exp, iat, jti: tokenId, iss: 'test', type: 'access' };
  return jwt.sign(payload, SOMBRA_PRIVATE_KEY, { algorithm: 'RS256', keyid: SOMBRA_KEY_ID });
}

export function generateTokenWrongPrivKey(userId: number, duration: number = 10 * 60): string {
  const iat = nowUTCEpochSeconds();
  const exp = iat + duration;
  const tokenId = uuid.v4();
  const payload = { sub: userId, exp, iat, jti: tokenId, iss: 'test', type: 'access' };
  return jwt.sign(payload, SOMBRA_BAD_PRIVATE_KEY, { algorithm: 'RS256', keyid: SOMBRA_KEY_ID });
}
