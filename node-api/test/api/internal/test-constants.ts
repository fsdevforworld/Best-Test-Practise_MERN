import * as config from 'config';

export const AUTH_SECRET = 'fake-test-auth';
export const CLIENT_ID = config.get('internal-auth.clientId');
// the secret in config/test.json is derived from the hash of the test client ID and AUTH_SECRET above
export const HASHED_KEY = config.get('internal-auth.secret');
