import * as request from 'supertest';
import { expect } from 'chai';
import * as sinon from 'sinon';
import app from '../../../../../../src/services/internal-dashboard-api';
import { clean, withInternalUser, replayHttp } from '../../../../../test-helpers';
import factory from '../../../../../factories';
import { User, BankAccount } from '../../../../../../src/models';
import { BankingInternalApiClient } from '../../../../../../src/services/internal-dashboard-api/v2/bank-accounts/monthly-statements/get-monthly-statements';

const sandbox = sinon.createSandbox();

describe('GET /v2/bank-accounts/:id/monthly-statements', () => {
  const fixture = '/dashboard/v2/bank-accounts/get-monthly-statements';
  const externalId = 'c49adcd0890411ebbd8a693742e169dc';

  before(() => clean());

  afterEach(() => clean(sandbox));

  let req: request.Test;
  let user: User;
  let bankAccount: BankAccount;

  beforeEach(async () => {
    user = await factory.create<User>('user');

    bankAccount = await factory.create<BankAccount>('bod-checking-account', {
      externalId,
      userId: user.id,
    });
  });

  it(
    'returns serialized monthly statements',
    replayHttp(`${fixture}/sucess.json`, async () => {
      req = request(app)
        .get(`/v2/bank-accounts/${bankAccount.id}/monthly-statements`)
        .expect(200);

      const {
        body: { data },
      } = await withInternalUser(req);

      expect(data).to.have.length(2);
      expect(data).to.deep.eq([
        {
          id: '73b17ddd1f494de79b2e77ff918a5a93',
          type: 'monthly-statement',
          attributes: {
            month: '05',
            year: '2021',
          },
          relationships: {
            bankAccount: { data: { type: 'bank-account', id: `${bankAccount.id}` } },
          },
        },
        {
          id: '20e7ff5446eb47fabb53fbb20690e80b',
          type: 'monthly-statement',
          attributes: {
            month: '04',
            year: '2021',
          },
          relationships: {
            bankAccount: { data: { type: 'bank-account', id: `${bankAccount.id}` } },
          },
        },
      ]);
    }),
  );

  it('does not include months with no statement', async () => {
    sandbox
      .stub(BankingInternalApiClient, 'getBankAccountMonthlyStatements')
      .withArgs(externalId)
      .resolves({
        data: {
          statements: [
            {
              id: '1',
              accountId: `${bankAccount.id}`,
              month: '01',
              year: '2021',
              isEmpty: false,
            },
            {
              id: undefined,
              accountId: `${bankAccount.id}`,
              month: '02',
              year: '2021',
              isEmpty: false,
            },
          ],
        },
      });

    req = request(app)
      .get(`/v2/bank-accounts/${bankAccount.id}/monthly-statements`)
      .expect(200);

    const {
      body: { data },
    } = await withInternalUser(req);

    expect(data).to.have.length(1);
  });

  it(
    'handles a 404 from banking',
    replayHttp(`${fixture}/404.json`, async () => {
      const noLinkedAccount = await factory.create<BankAccount>('bod-checking-account', {
        externalId: 'something-fake',
        userId: user.id,
      });

      req = request(app)
        .get(`/v2/bank-accounts/${noLinkedAccount.id}/monthly-statements`)
        .expect(200);

      const {
        body: { data },
      } = await withInternalUser(req);

      expect(data).to.have.length(0);
    }),
  );
});
