import { DashboardAction, DashboardActionReason } from '../../../../models';
import {
  NotFoundError,
  InvalidVerificationError,
  InvalidParametersError,
} from '../../../../lib/error';
import ActionCode from './action-code';

async function validateActionLog(
  dashboardActionReasonId: number,
  dashboardActionCode: ActionCode,
  note?: string,
): Promise<{ dashboardAction: DashboardAction; dashboardActionReason: DashboardActionReason }> {
  const dashboardActionReason = await DashboardActionReason.findByPk(dashboardActionReasonId, {
    include: [DashboardAction],
  });

  if (!dashboardActionReason) {
    throw new NotFoundError(`DashboardActionReason with id ${dashboardActionReasonId} not found`);
  }

  if (dashboardActionReason.noteRequired && !note) {
    throw new InvalidParametersError('Note is required for this reason.');
  }

  const dashboardAction = dashboardActionReason.dashboardAction;

  if (dashboardAction?.code !== dashboardActionCode) {
    throw new InvalidVerificationError(
      `Dashboard action reason provided does not correspond to the "${dashboardActionCode}" dashboard action`,
    );
  }

  return { dashboardAction, dashboardActionReason };
}

export default validateActionLog;
