import * as request from 'supertest';
import * as sinon from 'sinon';
import app from '../../../../../src/services/internal-dashboard-api';
import { clean, withInternalUser } from '../../../../test-helpers';
import factory from '../../../../factories';
import { BankConnection, BankConnectionRefresh, User } from '../../../../../src/models';
import { expect } from 'chai';
import { BankingDataSource } from '@dave-inc/wire-typings';
import * as Jobs from '../../../../../src/jobs/data';

describe('POST /v2/bank-connections', () => {
  const sandbox = sinon.createSandbox();
  before(() => clean());

  afterEach(() => clean(sandbox));

  let req: request.Test;
  let user: User;
  let bankConnection: BankConnection;
  let createInitiateBankConnectionRefresh: sinon.SinonStub;

  beforeEach(async () => {
    user = await factory.create<User>('user');
    bankConnection = await factory.create<BankConnection>('bank-connection', {
      userId: user.id,
    });

    req = request(app)
      .post('/v2/bank-connection-refreshes')
      .send({ bankConnectionId: bankConnection.id })
      .expect(200);

    createInitiateBankConnectionRefresh = sandbox.stub(Jobs, 'createInitiateBankConnectionRefresh');
  });

  it('creates bank-connection-refresh', async () => {
    const {
      body: { data },
    } = await withInternalUser(req);

    const connectionRefresh = await BankConnectionRefresh.findOne({
      where: { bankConnectionId: bankConnection.id },
    });

    expect(connectionRefresh).to.exist;

    expect(data.id).to.equal(`${connectionRefresh.id}`);
    expect(data.type).to.equal('bank-connection-refresh');
    expect(data.attributes.status).to.equal('CREATED');
  });

  it('creates bank-connection-refresh', async () => {
    const {
      body: {
        data: { id },
      },
    } = await withInternalUser(req);

    expect(
      createInitiateBankConnectionRefresh.calledOnceWith({
        bankConnectionRefreshId: parseInt(id, 10),
      }),
    ).to.be.true;
  });

  it('fails if bank connection source not plaid', async () => {
    const notPlaidConnection = await factory.create<BankConnection>('bank-connection', {
      userId: user.id,
      bankingDataSource: BankingDataSource.BankOfDave,
    });

    req = request(app)
      .post('/v2/bank-connection-refreshes')
      .send({ bankConnectionId: notPlaidConnection.id })
      .expect(400);

    const response = await withInternalUser(req);
    expect(response.body.message).to.contain('Must be a plaid banking connection');
  });

  it('fails if bank connection id is not valid', async () => {
    const missingBankConnectionReq = request(app)
      .post('/v2/bank-connection-refreshes')
      .send({ bankConnectionId: 'missing-connection-id' })
      .expect(404);

    const response = await withInternalUser(missingBankConnectionReq);
    expect(response.body.message).to.contain('Banking connection not found');
  });
});
