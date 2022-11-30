import { clean, up } from '../../../test-helpers';
import sendgrid from '../../../../src/lib/sendgrid';
import twilio from '../../../../src/lib/twilio';
import * as sinon from 'sinon';
import * as request from 'supertest';
import * as superagent from 'superagent';
import app from '../../../../src/api';
import * as jwt from 'jwt-simple';
import { expect } from 'chai';
import factory from '../../../factories';
import * as config from 'config';

describe('GET /advance/:encodedAdvanceId', () => {
  const sandbox = sinon.createSandbox();
  const JWT_SECRET: string = config.get('dave.jwt.secret');
  if (!JWT_SECRET) {
    throw new Error('JWT_SECRET environment variable is not set on host');
  }

  before(() => clean());

  // insert user and user_session data
  beforeEach(() => {
    sandbox.stub(twilio, 'send').resolves();
    sandbox.stub(sendgrid, 'send').resolves();
    sandbox.stub(superagent, 'get').returns({
      query: sandbox.stub().returnsThis,
      send: sandbox.stub().resolves({ body: [] }),
    });
    return up();
  });

  //truncate user and user_session data
  afterEach(() => clean(sandbox));

  it('should throw an error when encoded Advance Id isnt in correct format', async () => {
    const result = await request(app).get('/v2/advance/12345');

    expect(result.status).to.equal(404);
    expect(result.body.message).to.match(/Cannot find advance/);
  });

  it('should throw an error when decoded AdvanceId isnt an existing advance id in the database', async () => {
    const encodedAdvanceId = jwt.encode({ id: 99999999999 }, JWT_SECRET);

    const result = await request(app).get(`/v2/advance/${encodedAdvanceId}`);

    expect(result.status).to.equal(404);
    expect(result.body.message).to.match(/Cannot find advance/);
  });

  it('should successfully return a response object with the advance information', async () => {
    const user = await factory.create('user', {
      firstName: 'Dave',
      lastName: 'DaBear',
    });

    const advance = await factory.create('advance', {
      userId: user.id,
      amount: 75,
      delivery: 'EXPRESS',
      fee: 5,
      outstanding: '83.75',
      paybackDate: '2018-06-21',
    });

    const donationOrganization = await factory.create('donation-organization');
    await factory.create('advance-tip', {
      advanceId: advance.id,
      amount: 3.75,
      percent: 5,
      donationOrganizationId: donationOrganization.id,
    });

    const encodedAdvanceId = jwt.encode({ id: advance.id }, JWT_SECRET);

    const result = await request(app).get(`/v2/advance/${encodedAdvanceId}`);

    expect(result.status).to.equal(200);
    expect(result.body.amount).to.equal(75);
    expect(result.body.delivery).to.equal('EXPRESS');
    expect(result.body.fee).to.equal(5);
    expect(result.body.name).to.equal('Dave DaBear');
    expect(result.body.outstanding).to.equal(83.75);
    expect(result.body.paybackDate).to.equal('June 21, 2018');
    expect(result.body.tip).to.equal(3.75);
    expect(result.body.tipPercent).to.equal(5);
  });
});
