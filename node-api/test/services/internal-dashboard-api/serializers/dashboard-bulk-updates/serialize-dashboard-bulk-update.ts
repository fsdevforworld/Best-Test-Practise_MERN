import { expect } from 'chai';
import { dashboardBulkUpdateSerializer } from '../../../../../src/services/internal-dashboard-api/serializers';
import {
  DashboardAction,
  DashboardActionLog,
  DashboardActionReason,
  DashboardBulkUpdate,
  InternalUser,
} from '../../../../../src/models';
import factory from '../../../../factories';
import { clean } from '@test-helpers';

async function setup(actionName = 'Bulk Update Fraud Block') {
  const internalUser = await factory.create<InternalUser>('internal-user');
  const dashboardAction = await factory.create<DashboardAction>('dashboard-action', {
    name: actionName,
  });
  const dashboardActionReason = await factory.create<DashboardActionReason>(
    'dashboard-action-reason',
    { dashboardActionId: dashboardAction.id },
  );
  const dashboardActionLog = await factory.create<DashboardActionLog>('dashboard-action-log', {
    dashboardActionReasonId: dashboardActionReason.id,
    internalUserId: internalUser.id,
  });

  const bulkUpdate = await factory.create<DashboardBulkUpdate>('dashboard-bulk-update', {
    dashboardActionLogId: dashboardActionLog.id,
  });

  return { internalUser, dashboardAction, bulkUpdate };
}

describe('serialize bulk update', () => {
  const serialize = dashboardBulkUpdateSerializer.serializeDashboardBulkUpdate;

  before(() => clean());

  afterEach(() => clean());

  ['name', 'inputFileUrl', 'inputFileRowCount', 'outputFileUrl', 'status'].forEach(
    (prop: keyof DashboardBulkUpdate) => {
      it(`includes ${prop}`, async () => {
        const { bulkUpdate } = await setup();
        const { attributes } = await serialize(bulkUpdate);
        expect((attributes as Record<string, unknown>)[prop]).to.equal(bulkUpdate[prop]);
      });
    },
  );

  it('includes createdBy', async () => {
    const { internalUser, bulkUpdate } = await setup();
    const { attributes } = await serialize(bulkUpdate);
    expect(attributes.createdBy).to.equal(internalUser.email);
  });

  it('includes created', async () => {
    const { bulkUpdate } = await setup();
    const { attributes } = await serialize(bulkUpdate);
    expect(attributes.created).to.be.a('string');
  });

  it('includes updated', async () => {
    const { bulkUpdate } = await setup();
    const { attributes } = await serialize(bulkUpdate);
    expect(attributes.updated).to.be.a('string');
  });

  it('includes actionName', async () => {
    const { bulkUpdate } = await setup();
    const { attributes } = await serialize(bulkUpdate);
    expect(attributes.actionName).to.be.a('string');
  });

  [
    { raw: ' Bulk  Update  Fraud Block', stripped: 'Fraud Block' },
    { raw: 'Bulk Update  Fraud Block', stripped: 'Fraud Block' },
    { raw: 'bulk Update  Fraud Block', stripped: 'Fraud Block' },
    { raw: 'Bulk update  Hi!!', stripped: 'Hi!!' },
    { raw: 'bulk update Howdy Bulk Update', stripped: 'Howdy' },
  ].forEach(({ raw, stripped }) => {
    it(`converts ${raw} to ${stripped}`, async () => {
      const { bulkUpdate } = await setup(raw);
      const { attributes } = await serialize(bulkUpdate);
      expect(attributes.actionName).to.equal(stripped);
    });
  });

  it('parses actionName correctly when bulk update not included', async () => {
    const { dashboardAction, bulkUpdate } = await setup('Fraud Block with randomness inside');
    const { attributes } = await serialize(bulkUpdate);
    expect(attributes.actionName).to.equal(dashboardAction.name);
  });
});
