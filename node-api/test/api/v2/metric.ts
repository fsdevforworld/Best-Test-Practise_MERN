import * as request from 'supertest';
import app from '../../../src/api';
import { ABTestingEvent } from '../../../src/models';
import { moment } from '@dave-inc/time-lib';
import { expect } from 'chai';
import { clean } from '../../test-helpers';
import factory from '../../factories';

describe('metric tests', () => {
  before(() => clean());

  describe('v2', () => {
    describe('GET /metric/active', () => {
      it('should update the user last active property', async () => {
        const time = moment().subtract(1, 'second');
        const user = await factory.create('user');
        return request(app)
          .get('/v2/metric/last_active')
          .set('Authorization', user.id)
          .set('X-Device-Id', user.id)
          .expect(200)
          .then(async () => {
            await user.reload();
            expect(time.isBefore(user.lastActive)).to.be.true;
          });
      });
    });

    describe('POST /metric/ab_testing_event', () => {
      it('should create an ab testing event', async () => {
        const data = {
          eventUuid: 123123,
          eventName: 'cheese',
          results: { bacon: true },
        };
        const user = await factory.create('user');
        return request(app)
          .post('/v2/metric/ab_testing_event')
          .set('Authorization', user.id)
          .set('X-Device-Id', user.id)
          .send(data)
          .expect(200)
          .then(async () => {
            const res = await ABTestingEvent.findOne({ where: { userId: user.id } });
            expect(res.eventUuid).to.equal(data.eventUuid);
            expect(res.eventName).to.equal(data.eventName);
            expect(res.userId).to.equal(user.id);
          });
      });

      it('should fail if results is not provided', async () => {
        const data = {
          eventUuid: 123123,
          eventName: 'cheese',
        };
        const user = await factory.create('user');
        return request(app)
          .post('/v2/metric/ab_testing_event')
          .set('Authorization', user.id)
          .set('X-Device-Id', user.id)
          .send(data)
          .expect(400);
      });
    });
  });
});
