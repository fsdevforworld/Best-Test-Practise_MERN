import { MOMENT_FORMATS } from '@dave-inc/time-lib';
import {
  DashboardAction,
  DashboardActionReason,
  DashboardUserModification,
  InternalUser,
} from '../../../../models';
import { serializeDate } from '../../../../serialization';
import ChangelogEntryDetail from './changelog-entry-detail';
import IChangelogEntryResource from './i-changelog-entry-resource';
import serializeActionLogDetail from './serialize-action-log-detail';

async function serializeCoolOffWaive(
  modification: DashboardUserModification,
): Promise<IChangelogEntryResource> {
  const actionLog =
    modification.dashboardActionLog ||
    (await modification.getDashboardActionLog({
      include: [
        {
          model: DashboardActionReason,
          include: [DashboardAction],
        },
        InternalUser,
      ],
    }));

  const serializedActionLog = await serializeActionLogDetail(actionLog);

  const details: ChangelogEntryDetail[] = [
    {
      type: 'field',
      attributes: {
        name: 'Request date',
        value: serializeDate(modification.created, MOMENT_FORMATS.YEAR_MONTH_DAY),
        dataType: 'date',
      },
    },
    serializedActionLog,
  ];

  return {
    id: `cool-off-waive-${modification.id}`,
    type: 'changelog-entry',
    attributes: {
      title: modification.dashboardActionLog.dashboardActionReason.dashboardAction.name,
      initiator: 'agent',
      status: 'CLOSED',
      priority: 'high',
      occurredAt: serializeDate(modification.created),
      details,
    },
  };
}

export default serializeCoolOffWaive;
