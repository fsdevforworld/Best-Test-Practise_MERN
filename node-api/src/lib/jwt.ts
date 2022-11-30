import * as config from 'config';
import * as jwt from 'jwt-simple';
import { moment } from '@dave-inc/time-lib';

const JWT_SECRET: string = config.get('dave.jwt.secret');
const JWT_EXPIRATION: string = config.get('dave.jwt.expiration');

if (!JWT_SECRET) {
  throw new Error('JWT_SECRET environment variable is not set on host');
}

export function decode(token: string) {
  return jwt.decode(token, JWT_SECRET);
}

type EncodeOptions = {
  expire?: boolean;
};
export function encode(payload: object, options: EncodeOptions = {}) {
  const { expire = true } = options;
  if (expire) {
    const exp = moment().unix() + JWT_EXPIRATION;
    return jwt.encode({ exp, ...payload }, JWT_SECRET);
  }
  return jwt.encode(payload, JWT_SECRET);
}

export function getExpiration(seconds: number | string = JWT_EXPIRATION) {
  return moment().unix() + Number(seconds);
}
