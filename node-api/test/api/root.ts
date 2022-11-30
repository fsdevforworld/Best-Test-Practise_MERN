import * as request from 'supertest';
import app from '../../src/api';
import { expect } from 'chai';
import 'chai-json-schema';
import 'mocha';

describe('GET /', () => {
  it('should return some deployment info', async () => {
    const { body } = await request(app).get('/');

    expect(body).to.deep.equal({
      ok: true,
      commitRef: 'HEAD',
      branch: 'development',
      lastUpdated: 'NOW',
    });
  });
});
