import * as request from 'supertest';
import {
  clean,
  replayHttp,
  validateRelationships,
  withInternalUser,
} from '../../../../test-helpers';
import { User } from '../../../../../src/models';
import { expect } from 'chai';
import app from '../../../../../src/services/internal-dashboard-api';
import factory from '../../../../factories';
import { IApiResourceObject } from '../../../../typings';

const fixturePath = 'services/internal-dashboard-api/v2/users/get-overdrafts';

describe('GET /v2/users/:id/overdrafts', () => {
  before(() => clean());
  afterEach(() => clean());

  let user: User;
  let req: request.Test;

  beforeEach(async () => {
    user = await factory.create<User>('user', { id: 3898852 });

    req = request(app)
      .get(`/v2/users/${user.id}/overdrafts`)
      .expect(200);
  });

  it(
    'gets overdrafts',
    replayHttp(`${fixturePath}/success.json`, async () => {
      const {
        body: { data },
      } = await withInternalUser(req);

      expect(data).to.have.length(1);

      const [overdraft] = data;

      expect(overdraft.type).to.equal('overdraft');
    }),
  );

  it(
    'includes relationships',
    replayHttp(`${fixturePath}/success.json`, async () => {
      const {
        body: { data, included },
      } = await withInternalUser(req);

      const [overdraft] = data;

      validateRelationships(
        { data: overdraft, included },
        {
          overdraftAccount: 'overdraft-account',
          overdraftDisbursements: 'overdraft-disbursement',
          overdraftSettlements: 'overdraft-settlement',
        },
      );

      expect(overdraft.relationships.approval.data.type).to.equal('advance-approval');
    }),
  );

  it(
    'serializes settlement source',
    replayHttp(`${fixturePath}/success.json`, async () => {
      const {
        body: { included },
      } = await withInternalUser(req);

      const [settlement] = included.filter(
        (resource: IApiResourceObject) => resource.type === 'overdraft-settlement',
      );

      expect(settlement.relationships.source.data.id).to.match(/^(BANK|DAVE|DEBIT):[a-z\d]+$/);
    }),
  );

  it(
    'serializes disbursement source',
    replayHttp(`${fixturePath}/success.json`, async () => {
      const {
        body: { included },
      } = await withInternalUser(req);

      const [disbursement] = included.filter(
        (resource: IApiResourceObject) => resource.type === 'overdraft-disbursement',
      );

      expect(disbursement.relationships.source.data.id).to.match(/^(BANK|DAVE|DEBIT):[a-z\d]+$/);
    }),
  );

  it(
    'handles user with no overdrafts',
    replayHttp(`${fixturePath}/no-overdrafts.json`, async () => {
      const noOverdraftsUser = await factory.create<User>('user', { id: 3997091 });

      const {
        body: { data },
      } = await withInternalUser(
        request(app)
          .get(`/v2/users/${noOverdraftsUser.id}/overdrafts`)
          .expect(200),
      );

      expect(data).to.be.empty;
    }),
  );

  it(
    'handles user with no overdraft account',
    replayHttp(`${fixturePath}/no-account.json`, async () => {
      const noAccountUser = await factory.create<User>('user', { id: 1 });

      const {
        body: { data },
      } = await withInternalUser(
        request(app)
          .get(`/v2/users/${noAccountUser.id}/overdrafts`)
          .expect(200),
      );

      expect(data).to.have.length(0);
    }),
  );
});
