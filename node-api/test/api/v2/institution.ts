import { expect } from 'chai';
import * as request from 'supertest';
import * as sinon from 'sinon';
import app from '../../../src/api';
import factory from '../../factories';
import { clean } from '../../test-helpers';
import plaidClient from '../../../src/lib/plaid';
import {
  PlaidInstitutionRefreshInterval,
  PlaidInstitutionStatus,
} from '../../../src/typings/plaid';

describe('/v2/institution/*', () => {
  const sandbox = sinon.createSandbox();

  before(() => clean());

  afterEach(() => clean(sandbox));

  describe('GET /institution/:id/status', () => {
    it('should return login and transaction errors', async () => {
      const user = await factory.create('user', {});
      const userSession = await factory.create('user-session', { userId: user.id });
      const institution = await factory.create('institution');

      const plaidResponse = await factory.build(
        'plaid_status_response_unhealthy_login_and_transaction',
      );
      sandbox.stub(plaidClient, 'getInstitutionById').resolves(plaidResponse);

      const response = await request(app)
        .get(`/v2/institution/${institution.id}/status`)
        .set('X-Device-Id', userSession.deviceId)
        .set('Authorization', userSession.token);

      const institutionStatuses = response.body;
      const { login, transactions } = institutionStatuses;

      expect(login.status).to.be.eq(PlaidInstitutionStatus.DOWN);
      expect(login.message).to.be.eq('Login Outage');
      expect(transactions.status).to.be.eq(PlaidInstitutionStatus.DEGRADED);
      expect(transactions.refreshInterval).to.be.eq(PlaidInstitutionRefreshInterval.STOPPED);
      expect(transactions.message).to.match(
        /Missing transactions or transaction updates since \d{2}-\d{2}-\d{4} \d{2}:\d{2}:\d{2} [A|P]M [-|+]\d{2}:\d{2} PT/,
      );
    });

    it('should throw a not found error if an institution could not be found', async () => {
      const user = await factory.create('user', {});
      const userSession = await factory.create('user-session', { userId: user.id });

      const response = await request(app)
        .get(`/v2/institution/11/status`)
        .set('X-Device-Id', userSession.deviceId)
        .set('Authorization', userSession.token);

      expect(response.status).to.be.equal(404);
      expect(response.body.message).to.match(/No institution could be found\./);
    });
  });
});
