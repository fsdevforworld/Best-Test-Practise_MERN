import * as request from 'supertest';
import { clean, replayHttp, withInternalUser } from '../../../../test-helpers';
import { User } from '../../../../../src/models';
import app from '../../../../../src/services/internal-dashboard-api';
import factory from '../../../../factories';
import { expect } from 'chai';

const fixturePath = 'services/internal-dashboard-api/v2/users/get-promotions';

describe('GET /v2/users/:id/promotions', () => {
  beforeEach(async () => {
    await clean();
  });

  it(
    'fetches all promotion data for the user',
    replayHttp(`${fixturePath}/success.json`, async () => {
      const user = await factory.create<User>('user', { id: 49 });

      const {
        body: { data },
      } = await withInternalUser(
        request(app)
          .get(`/v2/users/${user.id}/promotions`)
          .expect(200),
      );

      expect(data.length).to.deep.equal(1);
      expect(data[0].type).to.equal('user-promotion');
    }),
  );

  it(
    'handles when the promo api responds with a 404',
    replayHttp(`${fixturePath}/not-found.json`, async () => {
      const user = await factory.create<User>('user', { id: 123456789 });

      const res = await withInternalUser(
        request(app)
          .get(`/v2/users/${user.id}/promotions`)
          .expect(200),
      );

      expect(res.body).to.deep.equal({ data: [] });
    }),
  );
});
