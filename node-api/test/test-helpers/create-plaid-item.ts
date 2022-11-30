import * as request from 'supertest';
import * as config from 'config';
import plaid from '../../src/lib/plaid';

export default async function createPlaidItem({
  institutionId = 'ins_109508',
  initialProducts = ['transactions'],
} = {}) {
  const {
    body: { public_token: publicToken },
  } = await request('https://sandbox.plaid.com/sandbox')
    .post('/public_token/create')
    .type('json')
    .send({
      institution_id: institutionId,
      public_key: config.get('plaid.publicKey'),
      initial_products: initialProducts,
    });

  return plaid.exchangePublicToken(publicToken);
}
