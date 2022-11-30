import * as config from 'config';
import Client from './client';

const TOKEN = config.get<string>('zendesk.chat.token');

export default new Client({
  token: TOKEN,
});
