import * as Bluebird from 'bluebird';
import { expect } from 'chai';
import * as sinon from 'sinon';
import * as request from 'supertest';

import { clean, up } from '../../test-helpers';
import app from '../../../src/api';
import gcloudKms from '../../../src/lib/gcloud-kms';
import sendgrid from '../../../src/lib/sendgrid';

describe('/v2/ccpa_request', () => {
  const sandbox = sinon.createSandbox();
  let sendgridStub: sinon.SinonStub;

  before(() => clean());

  beforeEach(() => {
    sendgridStub = sandbox.stub(sendgrid, 'send').resolves();
    sandbox.stub(gcloudKms, 'encrypt').callsFake(val => Bluebird.resolve({ ciphertext: val }));
    return up();
  });

  afterEach(() => clean(sandbox));

  describe('POST /onboarding_step', () => {
    it('should fail gracefully if first name is not sent', async () => {
      const response = await request(app)
        .post('/v2/ccpa_request')
        .set('X-Device-Id', 'id-13')
        .send({
          lastName: 'Harden',
          email: 'james.harden@houstonrockets.com',
          birthdate: '08-26-1989',
          ssn: '123456789',
          requestType: 'REQUEST',
          details: "some elaborate details why i'm requesting my data",
        })
        .expect(400);

      expect(response.body.message).to.match(/Required parameters/);
    });

    it('should fail gracefully if last name is not sent', async () => {
      const response = await request(app)
        .post('/v2/ccpa_request')
        .set('X-Device-Id', 'id-13')
        .send({
          firstName: 'James',
          email: 'james.harden@houstonrockets.com',
          birthdate: '08-26-1989',
          ssn: '123456789',
          requestType: 'REQUEST',
          details: "some elaborate details why i'm requesting my data",
        })
        .expect(400);

      expect(response.body.message).to.match(/Required parameters/);
    });

    it('should fail gracefully if email is not sent', async () => {
      const response = await request(app)
        .post('/v2/ccpa_request')
        .set('X-Device-Id', 'id-13')
        .send({
          firstName: 'James',
          lastName: 'Harden',
          birthdate: '08-26-1989',
          ssn: '123456789',
          requestType: 'REQUEST',
          details: "some elaborate details why i'm requesting my data",
        })
        .expect(400);

      expect(response.body.message).to.match(/Required parameters/);
    });

    it('should fail gracefully if birthdate is not sent', async () => {
      const response = await request(app)
        .post('/v2/ccpa_request')
        .set('X-Device-Id', 'id-13')
        .send({
          firstName: 'James',
          lastName: 'Harden',
          email: 'james.harden@houstonrockets.com',
          ssn: '123456789',
          requestType: 'REQUEST',
          details: "some elaborate details why i'm requesting my data",
        })
        .expect(400);

      expect(response.body.message).to.match(/Required parameters/);
    });

    it('should fail gracefully if ssn is not sent', async () => {
      const response = await request(app)
        .post('/v2/ccpa_request')
        .set('X-Device-Id', 'id-13')
        .send({
          firstName: 'James',
          lastName: 'Harden',
          email: 'james.harden@houstonrockets.com',
          birthdate: '08-26-1989',
          requestType: 'REQUEST',
          details: "some elaborate details why i'm requesting my data",
        })
        .expect(400);

      expect(response.body.message).to.match(/Required parameters/);
    });

    it('should fail gracefully if requestType is not sent', async () => {
      const response = await request(app)
        .post('/v2/ccpa_request')
        .set('X-Device-Id', 'id-13')
        .send({
          firstName: 'James',
          lastName: 'Harden',
          email: 'james.harden@houstonrockets.com',
          birthdate: '08-26-1989',
          ssn: '123456789',
          details: "some elaborate details why i'm requesting my data",
        })
        .expect(400);

      expect(response.body.message).to.match(/Required parameters/);
    });

    it('should fail gracefully if details are not sent', async () => {
      const response = await request(app)
        .post('/v2/ccpa_request')
        .set('X-Device-Id', 'id-13')
        .send({
          firstName: 'James',
          lastName: 'Harden',
          email: 'james.harden@houstonrockets.com',
          birthdate: '08-26-1989',
          ssn: '123456789',
          requestType: 'REQUEST',
        })
        .expect(400);

      expect(response.body.message).to.match(/Required parameters/);
    });

    it('should fail gracefully if email is invalid format', async () => {
      const response = await request(app)
        .post('/v2/ccpa_request')
        .set('X-Device-Id', 'id-13')
        .send({
          firstName: 'James',
          lastName: 'Harden',
          email: 'james.harden',
          birthdate: '08-26-1989',
          ssn: '123456789',
          requestType: 'REQUEST',
          details: "some elaborate details why i'm requesting my data",
        })
        .expect(400);

      expect(response.body.message).to.match(/Please enter a valid email./);
    });

    it('should fail gracefully if birthdate is invalid format', async () => {
      const response = await request(app)
        .post('/v2/ccpa_request')
        .set('X-Device-Id', 'id-13')
        .send({
          firstName: 'James',
          lastName: 'Harden',
          email: 'james.harden@houstonrockets.com',
          birthdate: 'August 26th, 1989',
          ssn: '123456789',
          requestType: 'REQUEST',
          details: "some elaborate details why i'm requesting my data",
        })
        .expect(400);

      expect(response.body.message).to.match(/Invalid birthdate/);
    });

    it('should fail gracefully if requestType is an invalid type', async () => {
      const response = await request(app)
        .post('/v2/ccpa_request')
        .set('X-Device-Id', 'id-13')
        .send({
          firstName: 'James',
          lastName: 'Harden',
          email: 'james.harden@houstonrockets.com',
          birthdate: '08-26-1989',
          ssn: '123456789',
          requestType: 'beardTrimming',
          details: "some elaborate details why i'm trimming my beard",
        })
        .expect(400);

      expect(response.body.message).to.match(/Invalid requestType/);
    });

    it('should successfully create a ccpa request record', async () => {
      const response = await request(app)
        .post('/v2/ccpa_request')
        .set('X-Device-Id', 'id-13')
        .send({
          firstName: 'James',
          lastName: 'Harden',
          email: 'james.harden@houstonrockets.com',
          birthdate: '08-26-1989',
          ssn: '123456789',
          requestType: 'REQUEST',
          details: "some elaborate details why i'm requesting my data",
        });

      expect(response.status).to.equal(200);
    });

    it('should successfully create a ccpa deletion record', async () => {
      const response = await request(app)
        .post('/v2/ccpa_request')
        .set('X-Device-Id', 'id-13')
        .send({
          firstName: 'James',
          lastName: 'Harden',
          email: 'james.harden@houstonrockets.com',
          birthdate: '08-26-1989',
          ssn: '123456789',
          requestType: 'DELETION',
          details: "some elaborate details why i'm requesting my data to be deleted",
        });

      expect(response.status).to.equal(200);
    });

    it('should rate limit after 3 ccpa requests in a minute', async () => {
      await request(app)
        .post('/v2/ccpa_request')
        .set('X-Device-Id', 'id-13')
        .send({
          firstName: 'Russell',
          lastName: 'Westbrook',
          email: 'russell.westbrook@houstonrockets.com',
          birthdate: '11-12-1988',
          ssn: '123456789',
          requestType: 'DELETION',
          details: "some elaborate details why i'm requesting my data to be deleted",
        });

      await request(app)
        .post('/v2/ccpa_request')
        .set('X-Device-Id', 'id-13')
        .send({
          firstName: 'PJ',
          lastName: 'Tucker',
          email: 'pj.tucker@houstonrockets.com',
          birthdate: '05-05-1985',
          ssn: '123456789',
          requestType: 'DELETION',
          details: "some elaborate details why i'm requesting my data to be deleted",
        });

      await request(app)
        .post('/v2/ccpa_request')
        .set('X-Device-Id', 'id-13')
        .send({
          firstName: 'James',
          lastName: 'Harden',
          email: 'james.harden@houstonrockets.com',
          birthdate: '08-26-1989',
          ssn: '123456789',
          requestType: 'DELETION',
          details: "some elaborate details why i'm requesting my data to be deleted",
        });

      const response = await request(app)
        .post('/v2/ccpa_request')
        .set('X-Device-Id', 'id-13')
        .send({
          firstName: 'Mike',
          lastName: "D'Antoni",
          email: 'mike.dantoni@houstonrockets.com',
          birthdate: '05-08-1951',
          ssn: '123456789',
          requestType: 'DELETION',
          details: "some elaborate details why i'm requesting my data to be deleted",
        });

      expect(response.status).to.equal(429);
    });

    it('it should not send email on failed requests', async () => {
      const response = await request(app)
        .post('/v2/ccpa_request')
        .set('X-Device-Id', 'id-13')
        .send({
          lastName: 'Harden',
          email: 'matthewaftalion@dave.com',
          birthdate: '08-26-1989',
          ssn: '123456789',
          requestType: 'REQUEST',
          details: "some elaborate details why i'm requesting my data",
        })
        .expect(400);

      expect(sendgridStub).to.have.callCount(0);
      expect(response.body.message).to.match(/Required parameters/);
    });

    it('it should send email on successful requests', async () => {
      const response = await request(app)
        .post('/v2/ccpa_request')
        .set('X-Device-Id', 'id-13')
        .send({
          firstName: 'James',
          lastName: 'Harden',
          email: 'james.harden@houstonrockets.com',
          birthdate: '08-26-1989',
          ssn: '123456789',
          requestType: 'REQUEST',
          details: "some elaborate details why i'm requesting my data",
        });

      expect(sendgridStub).to.have.callCount(1);
      expect(response.status).to.equal(200);
    });
  });
});
