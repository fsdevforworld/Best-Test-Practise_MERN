import { moment, MOMENT_FORMATS } from '@dave-inc/time-lib';
import {
  MembershipPause,
  DashboardActionLog,
  DashboardActionLogMembershipPause,
} from '../../../../models';
import { serializeDate } from '../../../../serialization';
import { ActionCode } from '../../domain/action-log';
import ChangelogEntryDetail from './changelog-entry-detail';
import IChangelogEntryResource from './i-changelog-entry-resource';
import serializeAccountActivation from './serialize-account-activation';
import serializeActionLogDetail from './serialize-action-log-detail';

async function getActionLogs(
  membershipPause: MembershipPause,
): Promise<{ pause: DashboardActionLog | null; unpause: DashboardActionLog | null }> {
  const actionLogMembershipPauses = await DashboardActionLogMembershipPause.findAll({
    where: { membershipPauseId: membershipPause.id },
    include: [{ model: DashboardActionLog.scope('withRelated') }],
  });

  const actionLogs = actionLogMembershipPauses.map(record => record.dashboardActionLog);

  return {
    pause:
      actionLogs.find(
        actionLog =>
          actionLog.dashboardActionReason.dashboardAction.code === ActionCode.PauseAccount,
      ) || null,
    unpause:
      actionLogs.find(
        actionLog =>
          actionLog.dashboardActionReason.dashboardAction.code === ActionCode.ActivateAccount,
      ) || null,
  };
}

function getPauseStatus(membershipPause: MembershipPause) {
  const wasUnpausedBeforePauseStarted =
    moment(membershipPause.pausedAt).diff(moment(membershipPause.unpausedAt)) >= 0;

  const pauseDateInFuture = moment().diff(moment(membershipPause.pausedAt)) < 0;

  if (wasUnpausedBeforePauseStarted) {
    return 'PAUSE CANCELED';
  }

  if (pauseDateInFuture) {
    return 'UPCOMING PAUSE';
  }

  return 'PAUSED';
}

async function buildPauseEntry(
  membershipPause: MembershipPause,
  actionLog?: DashboardActionLog,
): Promise<IChangelogEntryResource> {
  const details: ChangelogEntryDetail[] = [
    {
      type: 'field',
      attributes: {
        name: 'pause request date',
        value: serializeDate(membershipPause.created, MOMENT_FORMATS.YEAR_MONTH_DAY),
        dataType: 'date',
      },
    },
    {
      type: 'field',
      attributes: {
        name: 'pause effective date',
        value: serializeDate(membershipPause.pausedAt, MOMENT_FORMATS.YEAR_MONTH_DAY),
        dataType: 'date',
      },
    },
  ];

  if (actionLog) {
    const serializedActionLog = await serializeActionLogDetail(actionLog);
    details.push(serializedActionLog);
  }

  return {
    id: `pause-${membershipPause.id}`,
    type: 'changelog-entry',
    attributes: {
      title: 'Account status',
      initiator: actionLog ? 'agent' : 'user',
      status: getPauseStatus(membershipPause),
      occurredAt: serializeDate(membershipPause.created),
      details,
    },
  };
}

async function serializeMembershipPause(
  membershipPause: MembershipPause,
): Promise<IChangelogEntryResource[]> {
  const entries: IChangelogEntryResource[] = [];
  const actionLogs = await getActionLogs(membershipPause);

  const hasPauseEnded = moment().isAfter(membershipPause.unpausedAt);
  if (hasPauseEnded) {
    const unpausedEntry = await serializeAccountActivation({
      id: `unpause-${membershipPause.id}`,
      activatedAt: membershipPause.unpausedAt,
      actionLog: actionLogs.unpause,
    });

    entries.push(unpausedEntry);
  }

  const pausedEntry = await buildPauseEntry(membershipPause, actionLogs.pause);
  entries.push(pausedEntry);

  return entries;
}

export default serializeMembershipPause;
