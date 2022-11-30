import * as request from 'supertest';
import * as sinon from 'sinon';
import app from '../../../../src/services/internal-dashboard-api';
import { expect } from 'chai';
import advanceFixture from '../../../fixtures/advance';
import {
  clean,
  createPlaidItem,
  disconnectPlaidItem,
  replayHttp,
  stubBankTransactionClient,
  stubLoomisClient,
  up,
  insertFixtureBankTransactions,
  withInternalUser,
} from '../../../test-helpers';
import {
  bankAccountFixture,
  bankConnectionFixture,
  institutionFixture,
  paymentMethodFixture,
  userFixture,
  userSessionFixture,
} from '../../../fixtures';
import factory from '../../../factories';
import * as Jobs from '../../../../src/jobs/data';

describe('/dashboard/bank_connection/* endpoints', () => {
  const sandbox = sinon.createSandbox();
  before(() => clean());

  beforeEach(() => {
    sandbox.stub(Jobs, 'createBroadcastBankDisconnectTask');
    stubLoomisClient(sandbox);
  });

  afterEach(() => clean(sandbox));

  describe('PUT /dashboard/bank_connection/:id/credentials', () => {
    beforeEach(async () => {
      stubBankTransactionClient(sandbox);
      insertFixtureBankTransactions();
      await up([
        userFixture,
        userSessionFixture,
        institutionFixture,
        bankConnectionFixture,
        bankAccountFixture,
        paymentMethodFixture,
        advanceFixture,
      ]);
    });

    it('should set has_valid_credentials on user bank connection', async () => {
      const uid = 6;
      const req = request(app)
        .put(`/dashboard/bank_connection/${uid}/credentials`)
        .send({ hasValidCredentials: false })
        .expect(200);

      const res = await withInternalUser(req);

      expect(res.body.hasValidCredentials).to.be.false;
    });
  });

  describe('POST /dashboard/bank_connection/:id/refresh', () => {
    it(
      'handles Plaid disconnects',
      replayHttp('dashboard/bank-connection/refresh-failed.json', async () => {
        const { access_token: authToken, item_id: externalId } = await createPlaidItem();

        const [bankConnection] = await Promise.all([
          factory.create('bank-connection', {
            externalId,
            authToken,
            hasValidCredentials: true,
          }),
          disconnectPlaidItem(authToken),
        ]);

        const req = request(app).post(`/dashboard/bank_connection/${bankConnection.id}/refresh`);
        const response = await withInternalUser(req);

        expect(response.status).to.equal(200);
        expect(response.body.success).to.equal(false);

        await bankConnection.reload();

        expect(bankConnection.hasValidCredentials).to.equal(false);
      }),
    );
  });
});
