import { expect } from 'chai';
import { clean } from '../../../../test-helpers';
import factory from '../../../../factories';

import {
  validateActionLog,
  ActionCode,
} from '../../../../../src/services/internal-dashboard-api/domain/action-log';
import {
  NotFoundError,
  InvalidVerificationError,
  InvalidParametersError,
} from '../../../../../src/lib/error';

describe('validateActionLog', () => {
  before(() => clean());

  afterEach(() => clean());

  const testCode = ActionCode.AdvanceFeeChange;

  it('Should return found dashboardActionReason and dashboardAction', async () => {
    const dashboardAction = await factory.create('dashboard-action', { code: testCode });
    const dashboardActionReason = await factory.create('dashboard-action-reason', {
      dashboardActionId: dashboardAction.id,
    });

    const res = await validateActionLog(dashboardActionReason.id, testCode, 'note');

    expect(res.dashboardAction.id).to.eql(dashboardAction.id);
    expect(res.dashboardActionReason.id).to.eq(dashboardActionReason.id);
  });

  it('Should throw not found error if the dashboard action reason cannot be found', async () => {
    await expect(validateActionLog(99909, testCode, 'note')).to.be.rejectedWith(
      NotFoundError,
      'DashboardActionReason with id 99909 not found',
    );
  });
  it('Should throw InvalidVerificationError if the dashboard action cannot be found', async () => {
    const reason = await factory.create('dashboard-action-reason');

    await expect(validateActionLog(reason.id, testCode, 'note')).to.be.rejectedWith(
      InvalidVerificationError,
      `Dashboard action reason provided does not correspond to the "${testCode}" dashboard action`,
    );
  });

  it('Should throw InvalidVerificationError if the dashboard action code does not match', async () => {
    const dashboardAction = await factory.create('dashboard-action', {
      code: ActionCode.GiveFreeMonths,
    });
    const reason = await factory.create('dashboard-action-reason', {
      dashboardActionId: dashboardAction.id,
    });

    await expect(validateActionLog(reason.id, testCode, 'note')).to.be.rejectedWith(
      InvalidVerificationError,
      `Dashboard action reason provided does not correspond to the "${testCode}" dashboard action`,
    );
  });

  it('Should throw InvalidParameterError if noteRequired is true and note is not provided', async () => {
    const dashboardAction = await factory.create('dashboard-action', {
      code: testCode,
    });
    const reason = await factory.create('dashboard-action-reason', {
      dashboardActionId: dashboardAction.id,
      reason: 'Note is required',
      noteRequired: true,
    });

    await expect(validateActionLog(reason.id, testCode, undefined)).to.be.rejectedWith(
      InvalidParametersError,
      'Note is required for this reason.',
    );
  });

  it('Should succeed if noteRequired is true and note is provided', async () => {
    const dashboardAction = await factory.create('dashboard-action', {
      code: testCode,
    });
    const reason = await factory.create('dashboard-action-reason', {
      dashboardActionId: dashboardAction.id,
      reason: 'Other',
      noteRequired: true,
    });

    const res = await validateActionLog(reason.id, testCode, 'note');

    expect(res.dashboardAction.id).to.eql(dashboardAction.id);
    expect(res.dashboardActionReason.id).to.eq(reason.id);
  });
});
