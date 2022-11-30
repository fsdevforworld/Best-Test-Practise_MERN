import * as request from 'supertest';
import { clean, replayHttp, withInternalUser } from '../../../../test-helpers';
import { User } from '../../../../../src/models';
import app from '../../../../../src/services/internal-dashboard-api';
import factory from '../../../../factories';
import { expect } from 'chai';

const fixturePath = 'services/internal-dashboard-api/v2/users/get-referrals';

describe('GET /v2/users/:id/referrals', () => {
  beforeEach(async () => {
    await clean();
  });

  it(
    'fetches referral data for the user',
    replayHttp(`${fixturePath}/success.json`, async () => {
      const user = await factory.create<User>('user', { id: 3 });

      const {
        body: { data },
      } = await withInternalUser(
        request(app)
          .get(`/v2/users/${user.id}/referrals`)
          .expect(200),
      );

      expect(data).to.have.length(3);
      expect(data[0].type).to.equal('referral');
    }),
  );

  it(
    'handles when the promo api responds with a 404',
    replayHttp(`${fixturePath}/not-found.json`, async () => {
      const user = await factory.create<User>('user', { id: 123456789 });

      const {
        body: { data, included },
      } = await withInternalUser(
        request(app)
          .get(`/v2/users/${user.id}/referrals`)
          .expect(200),
      );

      expect(data).to.have.length(0);
      expect(included).to.have.length(0);
    }),
  );
});
