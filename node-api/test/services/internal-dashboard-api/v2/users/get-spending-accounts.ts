import * as request from 'supertest';
import app from '../../../../../src/services/internal-dashboard-api';
import {
  clean,
  replayHttp,
  validateRelationships,
  withInternalUser,
} from '../../../../test-helpers';
import factory from '../../../../factories';

import { expect } from 'chai';
import { ISpendingAccountResource } from '../../serializers/dave-banking';
import { IApiResourceObject } from '../../../../typings';

describe('GET /v2/users/:id/spending-accounts', () => {
  const fixture = '/dashboard/v2/users/spending-accounts';
  const validUserId = 3;
  const bannedUserId = 4800;
  const invalidUserId = 1010101010;

  before(() => clean());

  afterEach(() => clean());

  describe('Valid account', () => {
    let req: request.Test;

    beforeEach(() => {
      factory.create('user', { id: validUserId });

      req = request(app)
        .get(`/v2/users/${validUserId}/spending-accounts`)
        .expect(200);
    });

    it(
      'responds with spending accounts',
      replayHttp(`${fixture}/valid-account.json`, async () => {
        const {
          body: { data },
        } = await withInternalUser(req);

        data.forEach((account: ISpendingAccountResource) => {
          expect(account.type).to.equal('spending-account');
        });
      }),
    );

    it(
      'includes cards',
      replayHttp(`${fixture}/valid-account.json`, async () => {
        const {
          body: { included },
        } = await withInternalUser(req);

        included.forEach((account: ISpendingAccountResource) => {
          expect(account.type).to.equal('spending-card');
        });
      }),
    );

    it(
      'includes relationships',
      replayHttp(`${fixture}/valid-account.json`, async () => {
        const {
          body: { data, included },
        } = await withInternalUser(req);

        validateRelationships({ data: data[0], included }, { cards: 'spending-card' });
      }),
    );
  });

  describe('Banned account', () => {
    let req: request.Test;

    beforeEach(() => {
      factory.create('user', { id: bannedUserId });

      req = request(app)
        .get(`/v2/users/${bannedUserId}/spending-accounts`)
        .expect(200);
    });

    it(
      'includes userBanned data',
      replayHttp(`${fixture}/user-banned.json`, async () => {
        const {
          body: { included },
        } = await withInternalUser(req);

        expect(included.some((data: IApiResourceObject) => data.type === 'dave-banking-ban')).to.be
          .true;
      }),
    );
  });

  describe('Non existent account', () => {
    let req: request.Test;

    beforeEach(() => {
      factory.create('user', { id: invalidUserId });

      req = request(app)
        .get(`/v2/users/${invalidUserId}/spending-accounts`)
        .expect(200);
    });

    it(
      'returns empty data',
      replayHttp(`${fixture}/non-existent.json`, async () => {
        const {
          body: { data, included },
        } = await withInternalUser(req);

        expect(data).to.be.empty;
        expect(included).to.be.empty;
      }),
    );
  });
});
