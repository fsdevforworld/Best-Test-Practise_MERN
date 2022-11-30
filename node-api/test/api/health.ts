import app from '../../src/api';
import * as request from 'supertest';
import { expect } from 'chai';

describe('Health checks', () => {
  it('should respond to the main health route', async () => {
    const result = await request(app).get('/');
    expect(result.status).to.equal(200);
    expect(result.body.ok).to.equal(true);
  });

  it('should respond to the v1 health route', async () => {
    const result = await request(app).get('/v1/ping');
    expect(result.status).to.equal(200);
    expect(result.text).to.equal('pong');
  });
});
