import * as request from 'supertest';
import app from '../../../../../src/services/internal-dashboard-api';
import { clean, withInternalUser } from '../../../../test-helpers';
import factory from '../../../../factories';
import { User, BankConnection, BankConnectionRefresh } from '../../../../../src/models';
import { expect } from 'chai';

describe('GET /v2/bank-connection-refreshes/:id', () => {
  before(() => clean());

  afterEach(() => clean());

  let req: request.Test;
  let user: User;
  let bankConnection: BankConnection;
  let bankConnectionRefresh: BankConnectionRefresh;

  beforeEach(async () => {
    user = await factory.create<User>('user');
    bankConnection = await factory.create<BankConnection>('bank-connection', {
      userId: user.id,
    });
    bankConnectionRefresh = await factory.create<BankConnectionRefresh>('bank-connection-refresh', {
      bankConnectionId: bankConnection.id,
    });

    req = request(app)
      .get(`/v2/bank-connection-refreshes/${bankConnectionRefresh.id}`)
      .expect(200);
  });

  it('returns serialized bank connection refresh', async () => {
    const {
      body: { data },
    } = await withInternalUser(req);

    expect(data.type).to.equal('bank-connection-refresh');
    expect(data.id).to.equal(`${bankConnectionRefresh.id}`);
  });
});
