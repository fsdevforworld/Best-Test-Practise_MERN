import * as request from 'supertest';
import factory from '../../factories';
import { clean } from '../../test-helpers';
import { expect } from 'chai';

import app from '../../../src/api';
import UserFeedback from '../../../src/models/user-feedback';

describe('POST /v2/user_feedback', () => {
  before(() => clean());

  afterEach(() => clean());

  it('should successfully create side hustle feedback', async () => {
    const user = await factory.create('user', {}, { hasSession: true });

    const result = await request(app)
      .post('/v2/user_feedback')
      .set('Authorization', user.id)
      .set('X-Device-Id', user.id)
      .send({
        feedback: 'Hello! Here is some feedback - side hustle is awesome!!',
        context: 'side-hustle',
      });

    const expectedFeedback = await UserFeedback.findOne({});

    expect(expectedFeedback.context).to.equal('side-hustle');
    expect(result.status).to.equal(200);
  });

  it('should fail if feedback is not provided', async () => {
    const user = await factory.create('user', {}, { hasSession: true });

    const result = await request(app)
      .post('/v2/user_feedback')
      .set('Authorization', user.id)
      .set('X-Device-Id', user.id);

    expect(result.status).to.equal(400);
  });
});
