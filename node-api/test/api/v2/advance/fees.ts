import { clean, stubBankTransactionClient, up } from '../../../test-helpers';
import sendgrid from '../../../../src/lib/sendgrid';
import twilio from '../../../../src/lib/twilio';
import * as sinon from 'sinon';
import * as request from 'supertest';
import * as superagent from 'superagent';
import app from '../../../../src/api';
import { expect } from 'chai';

describe('GET /advance/fees', () => {
  const sandbox = sinon.createSandbox();

  before(() => clean());

  // insert user and user_session data
  beforeEach(() => {
    sandbox.stub(twilio, 'send').resolves();
    sandbox.stub(sendgrid, 'send').resolves();
    sandbox.stub(superagent, 'get').returns({
      query: sandbox.stub().returnsThis,
      send: sandbox.stub().resolves({ body: [] }),
    });
    stubBankTransactionClient(sandbox);
    return up();
  });

  //truncate user and user_session data
  afterEach(() => clean(sandbox));

  it('should fail for an amount greater than the max advance amount', () => {
    return request(app)
      .get('/v2/advance/fees')
      .query({ amount: '200.01' })
      .expect(400);
  });

  it('returns standard: 0 and express: 5.99 for $100', async () => {
    const res = await request(app)
      .get('/v2/advance/fees')
      .query({ amount: '100' })
      .expect(200);

    expect(res.body.standard).to.eq(0);
    expect(res.body.express).to.eq(5.99);
  });

  it('returns standard: 0 and express: 4.99 for $75', () => {
    return request(app)
      .get('/v2/advance/fees')
      .query({ amount: '75' })
      .expect(200)
      .then(res => {
        expect(res.body.standard).to.equal(0);
        expect(res.body.express).to.equal(4.99);
      });
  });

  it('returns standard: 0 and express: 3.99 for $50', () => {
    return request(app)
      .get('/v2/advance/fees')
      .query({ amount: '50' })
      .expect(200)
      .then(res => {
        expect(res.body.standard).to.equal(0);
        expect(res.body.express).to.equal(3.99);
      });
  });

  it('returns standard: 0 and express: 2.49 for $15', () => {
    return request(app)
      .get('/v2/advance/fees')
      .query({ amount: '15' })
      .expect(200)
      .then(res => {
        expect(res.body.standard).to.equal(0);
        expect(res.body.express).to.equal(2.49);
      });
  });

  it('returns standard: 0 and express: 1.99 for $5', () => {
    return request(app)
      .get('/v2/advance/fees')
      .query({ amount: '5' })
      .expect(200)
      .then(res => {
        expect(res.body.standard).to.equal(0);
        expect(res.body.express).to.equal(1.99);
      });
  });

  it('returns standard: 0 and express: 2.49 for $10', () => {
    return request(app)
      .get('/v2/advance/fees')
      .query({ amount: '10' })
      .expect(200)
      .then(res => {
        expect(res.body.standard).to.equal(0);
        expect(res.body.express).to.equal(2.49);
      });
  });

  it('returns standard: 0 and express: 2.99 for $20', () => {
    return request(app)
      .get('/v2/advance/fees')
      .query({ amount: '20' })
      .expect(200)
      .then(res => {
        expect(res.body.standard).to.equal(0);
        expect(res.body.express).to.equal(2.99);
      });
  });
});
