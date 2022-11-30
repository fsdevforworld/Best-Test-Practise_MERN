import * as request from 'supertest';
import { expect } from 'chai';
import * as sinon from 'sinon';
import { moment } from '@dave-inc/time-lib';
import app from '../../../../../src/services/internal-dashboard-api';
import {
  clean,
  stubBalanceLogClient,
  withInternalUser,
  createBalanceLogs,
} from '../../../../test-helpers';
import factory from '../../../../factories';
import { User, BankAccount, BankConnection } from '../../../../../src/models';

const sandbox = sinon.createSandbox();

describe('GET /v2/bank-accounts/:id/daily-balance-logs', () => {
  before(() => clean());

  afterEach(() => clean(sandbox));

  let req: request.Test;
  let user: User;
  let bankConnection: BankConnection;
  let bankAccount: BankAccount;

  beforeEach(async () => {
    stubBalanceLogClient(sandbox);
    user = await factory.create<User>('user');
    bankConnection = await factory.create<BankConnection>('bank-connection', {
      userId: user.id,
    });
    bankAccount = await factory.create<BankAccount>('bank-account', {
      userId: user.id,
      bankConnectionId: bankConnection.id,
    });
  });

  it('returns serialized balance logs', async () => {
    const today = moment();
    await createBalanceLogs(
      bankAccount.userId,
      bankAccount.id,
      bankAccount.bankConnectionId,
      today,
      [30, 30, 30, 120],
    );

    const start = today.format('YYYY-MM-DD');
    const end = moment(today)
      .add(5, 'days')
      .format('YYYY-MM-DD');

    req = request(app)
      .get(
        `/v2/bank-accounts/${bankAccount.id}/daily-balance-logs?startDate=${start}&endDate=${end}`,
      )
      .expect(200);

    const {
      body: { data },
    } = await withInternalUser(req);

    const [log] = data;

    const logBankAccountId = log.relationships['bank-account'].data.id;

    expect(data.length).to.equal(4);
    expect(log.id).to.equal(`${start}-${logBankAccountId}`);
    expect(log.type).to.equal('daily-balance-log');
    expect(log.attributes.date).to.equal(start);
    expect(log.attributes.current).to.equal(30);
    expect(log.attributes.available).to.equal(30);
    expect(logBankAccountId).to.equal(`${bankAccount.id}`);
  });

  it('returns results if start and end date are the same', async () => {
    const today = moment();
    await createBalanceLogs(
      bankAccount.userId,
      bankAccount.id,
      bankAccount.bankConnectionId,
      today,
      [30],
    );

    const date = today.format('YYYY-MM-DD');

    req = request(app)
      .get(
        `/v2/bank-accounts/${bankAccount.id}/daily-balance-logs?startDate=${date}&endDate=${date}`,
      )
      .expect(200);

    const {
      body: { data },
    } = await withInternalUser(req);

    expect(data.length).to.equal(1);
  });

  it('fails if start and end params not present', async () => {
    req = request(app)
      .get(`/v2/bank-accounts/${bankAccount.id}/daily-balance-logs`)
      .expect(400);

    await withInternalUser(req);
  });

  it('fails if start param is after end param', async () => {
    const invalidStartDate = moment().format('YYYY-MM-DD');
    const endDate = moment(invalidStartDate).subtract(1, 'days');

    req = request(app)
      .get(
        `/v2/bank-accounts/${bankAccount.id}/daily-balance-logs?startDate=${invalidStartDate}&endDate=${endDate}`,
      )
      .expect(400);

    const response = await withInternalUser(req);
    expect(response.body.message).to.contain('Start date must be the same or before end date');
  });
});
