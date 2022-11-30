import promotionsClient from '@dave-inc/promotions-client';
import * as sinon from 'sinon';
import * as request from 'supertest';
import { expect } from 'chai';
import { clean, replayHttp } from '../../../test-helpers';
import factory from '../../../factories';
import app from '../../../../src/api';
import { User } from '../../../../src/models';

describe('promotions-api: Segment User endpoints', () => {
  const sandbox = sinon.createSandbox();

  before(() => clean(sandbox));

  afterEach(() => clean(sandbox));

  describe('POST /promotions/segment-user', () => {
    it(
      'should return proper response on success',
      replayHttp('services/promotions/segment-user/create-success-response.json', async () => {
        const user = await factory.create<User>('user', { id: 227 });
        const segmentId = 'cf34205a-1583-4e3e-ada1-1e050fa4d8cb';

        const response = await request(app)
          .post('/promotions/segment-user')
          .set('Authorization', `${user.id}`)
          .set('X-Device-Id', `${user.id}`)
          .send({ segmentId })
          .expect(200);

        expect(response.body).to.be.deep.eq({
          userId: user.id,
          segmentId,
          promoCampaignId: 1,
        });
      }),
    );

    it('should throw an InvalidCredentialsError if no session was found with the user and device id', async () => {
      const result = await request(app)
        .post('/promotions/segment-user')
        .set('Authorization', 'hacker')
        .set('X-Device-Id', 'skeletonKey')
        .send({ segmentId: 'Jeff4WorldOverlord' })
        .expect(401);

      expect(result.body.message).to.match(/No valid session was found for device_id/);
    });

    it('should throw an InvalidParametersError if campaign id is not provided', async () => {
      const user = await factory.create<User>('user');

      const result = await request(app)
        .post('/promotions/segment-user')
        .set('Authorization', `${user.id}`)
        .set('X-Device-Id', `${user.id}`)
        .send()
        .expect(400);

      expect(result.body.message).to.match(/Required parameters not provided: segmentId/);
    });

    it('should throw an error if promotions-client errors out with the proper response status', async () => {
      const user = await factory.create<User>('user');
      const segmentId = 'cf34205a-1583-4e3e-ada1-1e050fa4d8cb';
      sandbox.stub(promotionsClient, 'createSegmentUser').throws({
        status: 404,
        cause: { text: JSON.stringify({ error: "Something wasn't found" }) },
      });

      const result = await request(app)
        .post('/promotions/segment-user')
        .set('Authorization', `${user.id}`)
        .set('X-Device-Id', `${user.id}`)
        .send({ segmentId })
        .expect(404);

      expect(result.body.message).to.match(/Something wasn't found/);
    });
  });
});
