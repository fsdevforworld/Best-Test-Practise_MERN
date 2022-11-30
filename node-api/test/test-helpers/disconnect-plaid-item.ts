import * as request from 'supertest';
import * as config from 'config';

export default function disconnectPlaidItem(authToken: string) {
  return request('https://sandbox.plaid.com/sandbox')
    .post('/item/reset_login')
    .type('json')
    .send({
      access_token: authToken,
      client_id: config.get('plaid.clientId'),
      secret: config.get('plaid.secret'),
    });
}
