import * as request from 'supertest';
import { clean, replayHttp, withInternalUser } from '../../../../../test-helpers';
import { User } from '../../../../../../src/models';
import app from '../../../../../../src/services/internal-dashboard-api';
import factory from '../../../../../factories';
import { expect } from 'chai';

const fixturePath = 'services/internal-dashboard-api/v2/users/get-goal-transfers';

describe('GET /v2/users/:id/goals/:id/transfers', () => {
  before(() => clean());
  afterEach(() => clean());

  it(
    'returns serialized transfer',
    replayHttp(`${fixturePath}/success.json`, async () => {
      const goalId = 'f44d9770a6d611ebb48ef3eb5e400874';
      const user = await factory.create<User>('user', { id: 2417722 });

      const {
        body: { data },
      } = await withInternalUser(
        request(app)
          .get(`/v2/users/${user.id}/goals/${goalId}/transfers`)
          .expect(200),
      );

      const [transfer] = data;

      const { id, type, attributes, relationships } = transfer;

      expect(id).to.equal('85615540a99211eb925ab9d760d4dca2');
      expect(type).to.equal('goal-transfer');

      expect(attributes).to.contain({
        amount: 50,
        description: 'Transfer from Plaid Checking to lkwejl',
        status: 'pending',
        transferType: 'ach',
      });
      expect(attributes.initiated).to.be.a('string');

      const { goal, recurringTransfer, fundingSource } = relationships;

      expect(goal.data.id).to.equal(goalId);
      expect(recurringTransfer.data.id).to.equal('19752860a6d711ebb48ef3eb5e400874');
      expect(fundingSource.data.id).to.equal('1873896');
    }),
  );

  it(
    'handles unknown goal id',
    replayHttp(`${fixturePath}/bad-goal-id.json`, async () => {
      const goalId = 'no-goal';
      const user = await factory.create<User>('user', { id: 2417722 });

      const {
        body: { data },
      } = await withInternalUser(
        request(app)
          .get(`/v2/users/${user.id}/goals/${goalId}/transfers`)
          .expect(200),
      );

      expect(data).to.have.length(0);
    }),
  );

  it(
    'handles goal id for different user',
    replayHttp(`${fixturePath}/wrong-user.json`, async () => {
      const goalId = 'c8697f50a6c411ebb48ef3eb5e400874';
      const user = await factory.create<User>('user', { id: 2417722 });

      const {
        body: { data },
      } = await withInternalUser(
        request(app)
          .get(`/v2/users/${user.id}/goals/${goalId}/transfers`)
          .expect(200),
      );

      expect(data).to.have.length(0);
    }),
  );
});
