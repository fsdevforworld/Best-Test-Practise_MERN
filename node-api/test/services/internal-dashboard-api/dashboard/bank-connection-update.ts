import * as request from 'supertest';
import app from '../../../../src/services/internal-dashboard-api';
import { moment } from '@dave-inc/time-lib';
import { expect } from 'chai';
import factory from '../../../factories';
import { clean, up, withInternalUser } from '../../../test-helpers';
import { BankConnectionUpdate } from '../../../../src/models/warehouse';
import * as sinon from 'sinon';

describe('bank_connection_update endpoints', () => {
  const sandbox = sinon.createSandbox();

  before(() => clean());

  beforeEach(() => {
    return up();
  });

  afterEach(() => clean());

  describe('SELECT ALL /dashboard/user/:userId/bank_connection_update', () => {
    it('gets all bank connection updates for a user', async () => {
      const bankConnectionUpdate = await factory.build('bank-connection-update');
      sandbox.stub(BankConnectionUpdate, 'getAllForUser').resolves([bankConnectionUpdate]);

      await factory.build('bank-connection-update', {
        userId: bankConnectionUpdate.userId,
        created: moment()
          .subtract(1, 'month')
          .format('YYYY-MM'),
      });

      const url = `/dashboard/user/${bankConnectionUpdate.userId}/bank_connection_update`;

      const req = request(app).get(url);
      const result = await withInternalUser(req);

      expect(result.status).to.equal(200);
      expect(result.body).to.be.an('array');
      expect(result.body.length).to.equal(1);
      expect(result.body[0].id).to.equal(bankConnectionUpdate.id);
    });
  });
});
