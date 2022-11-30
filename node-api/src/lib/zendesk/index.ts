import * as config from 'config';
import Client from './client';

export * from './constants';
export * from './types';

const ZENDESK_EMAIL = config.get<string>('zendesk.email');
const ZENDESK_TOKEN = config.get<string>('zendesk.token');
const ZENDESK_URL = config.get<string>('zendesk.url');

export default new Client({
  email: ZENDESK_EMAIL,
  token: ZENDESK_TOKEN,
  url: ZENDESK_URL,
});
