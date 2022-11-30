import * as request from 'supertest';
import app from '../../../../src/services/internal-dashboard-api';
import { replayHttp, withInternalUser } from '../../../test-helpers';

import { expect } from 'chai';

describe('bank_of_dave endpoints', () => {
  describe('GET /dashboard/bank_of_dave/user/:id', () => {
    const fixture = '/dashboard/dave-banking/user';
    const validUserId = 3;
    const bannedUserId = 4800;
    const invalidUserId = 1010101010;

    it(
      'successfully requests dave-banking api',
      replayHttp(`${fixture}/success.json`, async () => {
        const req = request(app)
          .get(`/dashboard/dave_banking/user/${validUserId}`)
          .expect(200);

        await withInternalUser(req);
      }),
    );

    it(
      'gets userBanned info',
      replayHttp(`${fixture}/user-banned/success.json`, async () => {
        const req = request(app)
          .get(`/dashboard/dave_banking/user/${bannedUserId}`)
          .expect(200);

        const res = await withInternalUser(req);
        expect(res.body.userBanned).to.exist;
      }),
    );

    it(
      'non existing user returns empty bank accounts and null userBanned',
      replayHttp(`${fixture}/non-user/success.json`, async () => {
        const req = request(app)
          .get(`/dashboard/dave_banking/user/${invalidUserId}`)
          .expect(200);

        const res = await withInternalUser(req);
        expect(res.body.bankAccounts).to.be.empty;
      }),
    );
  });
});
