import { expect } from 'chai';
import * as request from 'supertest';
import app from '../../../../../src/services/internal-dashboard-api';
import { User } from '../../../../../src/models';
import factory from '../../../../factories';
import { clean, withInternalUser } from '../../../../test-helpers';
import * as helpers from '../../../../../src/services/internal-dashboard-api/domain/dashboard-bulk-update';
import * as sinon from 'sinon';
import { ActionCode } from '../../../../../src/services/internal-dashboard-api/domain/action-log';

describe('GET /v2/dashboard-bulk-updates/:id/preview', () => {
  const sandbox = sinon.createSandbox();

  before(() => clean(sandbox));

  afterEach(() => clean(sandbox));

  let req: request.Test;

  beforeEach(async () => {
    const dashboardAction = await factory.create('dashboard-action', {
      code: ActionCode.BulkUpdateFraudBlock,
    });
    const dashboardActionReason = await factory.create('dashboard-action-reason', {
      noteRequired: true,
      dashboardActionId: dashboardAction.id,
    });
    const internalUser = await factory.create('internal-user', { email: 'test@dave.com' });

    const dashboardActionLog = await factory.create('dashboard-action-log', {
      internalUserId: internalUser.id,
      dashboardActionReasonId: dashboardActionReason.id,
      note: 'someNote',
    });

    const dashboardBulkUpdate = await factory.create('dashboard-bulk-update', {
      dashboardActionLogId: dashboardActionLog.id,
    });

    req = request(app)
      .get(`/v2/dashboard-bulk-updates/${dashboardBulkUpdate.id}/preview`)
      .expect(200);
  });

  it('returns all users affected by created fraud rules', async () => {
    const defaultMatchAttributes = {
      addressLine1: '1256 cochran st',
      city: 'Los Angeles',
      state: 'CA',
      zipCode: '90045',
    };

    const fraudUser = await factory.create<User>('user', {
      ...defaultMatchAttributes,
    });

    await Promise.all([
      factory.create<User>('user', {
        ...defaultMatchAttributes,
      }),
      factory.create<User>('user', {
        ...defaultMatchAttributes,
      }),
      factory.create<User>('user', {
        ...defaultMatchAttributes,
        zipCode: '90012',
      }),
    ]);

    sandbox.stub(helpers, 'downloadBulkUpdateCsvAsArray').returns([fraudUser.id]);

    const {
      body: { data: users },
    } = await withInternalUser(req, { roleAttrs: { name: 'bulkUpdateAdmin' } });

    expect(users.length).to.eq(3);
  });

  it('returns serialized users', async () => {
    const fraudUser = await factory.create<User>('user', {
      addressLine1: '1256 cochran st',
      city: 'Los Angeles',
      state: 'CA',
      zipCode: '90045',
    });

    sandbox.stub(helpers, 'downloadBulkUpdateCsvAsArray').returns([fraudUser.id]);

    const {
      body: {
        data: [user],
      },
    } = await withInternalUser(req, { roleAttrs: { name: 'bulkUpdateAdmin' } });

    expect(user.id).to.equal(`${fraudUser.id}`);
    expect(user.type).to.equal('dashboard-bulk-update-user');
    expect(user.attributes.email).to.equal(null);
    expect(user.attributes.addressLine1).to.equal(fraudUser.addressLine1);
    expect(user.attributes.city).to.equal(fraudUser.city);
    expect(user.attributes.state).to.equal(fraudUser.state);
    expect(user.attributes.zipCode).to.equal(fraudUser.zipCode);
    expect(user.attributes.firstName).to.equal(fraudUser.firstName);
    expect(user.attributes.lastName).to.equal(fraudUser.lastName);

    expect(user.attributes.created).not.to.be.null;
    expect(user.attributes.created).to.be.a('string');
    expect(user.attributes.updated).not.to.be.null;
    expect(user.attributes.updated).to.be.a('string');
  });

  it('returns empty list when bulk-update csv is empty', async () => {
    await factory.create<User>('user');

    sandbox.stub(helpers, 'downloadBulkUpdateCsvAsArray').returns([]);

    const {
      body: { data: bulkUpdates },
    } = await withInternalUser(req, { roleAttrs: { name: 'bulkUpdateAdmin' } });

    expect(bulkUpdates).to.be.empty;
  });
});
