import { expect } from 'chai';
import * as request from 'supertest';
import factory from '../../../factories';
import { clean } from '../../../test-helpers';
import app from '../../../../src/api';
import { User, MembershipPause } from '../../../../src/models';

describe('/v2/membership_pause/*', () => {
  before(() => clean());
  afterEach(() => clean());

  describe('POST /v2/membership_pause', () => {
    let user: User;
    let membershipPauseRequest: any;

    beforeEach(async () => {
      user = await factory.create<User>('user', { subscriptionFee: 1 }, { hasSession: true });
      membershipPauseRequest = createMembershipPauseRequest(user);
    });

    function createMembershipPauseRequest(requestUser: User) {
      return request(app)
        .post('/v2/membership_pause')
        .set('Authorization', requestUser.id.toString())
        .set('X-Device-Id', requestUser.id.toString());
    }

    it('should throw an error if the user has an outstanding advance', async () => {
      await Promise.all([
        factory.create('subscription-billing', {
          userId: user.id,
        }),
        factory.create('advance', {
          userId: user.id,
        }),
      ]);

      const result = await membershipPauseRequest.send();
      expect(result.status).to.equal(403);
      expect(result.body.message).to.match(/Can't pause a user who has an outstanding advance\./);
    });

    it('should successfully create a membership pause record', async () => {
      await factory.create('subscription-billing', {
        userId: user.id,
      });

      const result = await membershipPauseRequest.send();
      const response = result.body.data;

      expect(result.status).to.equal(200);
      expect(response.userId).to.equal(user.id);
      expect(response.isActive).to.be.true;
    });

    it('should throw a 400 error if the user already has a paused membership', async () => {
      await factory.create('subscription-billing', {
        userId: user.id,
      });

      const resultOne = await membershipPauseRequest.send();

      expect(resultOne.status).to.equal(200);
      expect(resultOne.body.data.userId).to.equal(user.id);
      expect(resultOne.body.data.isActive).to.be.true;

      const resultTwo = await createMembershipPauseRequest(user).send();

      expect(resultTwo.status).to.equal(400);
      expect(resultTwo.body.message).to.include('Your membership is already paused');
    });
  });

  describe('DELETE /v2/membership_pause', () => {
    it('should successfully unpause a user', async () => {
      const user = await factory.create<User>('user', { subscriptionFee: 0 }, { hasSession: true });
      await Promise.all([
        factory.create('subscription-billing', {
          userId: user.id,
          amount: 0,
        }),
        factory.create('membership-pause', {
          userId: user.id,
          pauserId: null,
        }),
      ]);
      await request(app)
        .delete('/v2/membership_pause')
        .set('Authorization', user.id.toString())
        .set('X-Device-Id', user.id.toString())
        .expect(200);
      const { userId } = await MembershipPause.findOne({
        where: { userId: user.id },
      });

      expect(userId).to.be.equal(user.id);
    });
  });
});
