import { InternalUser, DashboardActionReason, DashboardAction } from '../../../../models';
import { serializeDate } from '../../../../serialization';
import { IDashboardBaseModification } from '../../../../typings';
import IChangelogEntryResource from './i-changelog-entry-resource';
import ChangelogEntryDetail from './changelog-entry-detail';
import serializeActionLogDetail from './serialize-action-log-detail';
import serializeModificationDetails from './serialize-modification-details';
import { Options as DetailsOptions } from './serialize-modification-details';
import serialize from '../serialize';

const serializer: serialize<
  IDashboardBaseModification,
  IChangelogEntryResource
> = async function serializeModification(modification, options?: DetailsOptions) {
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
  const serializedModificationDetails = modification.modification
    ? serializeModificationDetails(modification.modification, options)
    : [];

  const details: ChangelogEntryDetail[] = [...serializedModificationDetails, serializedActionLog];

  return {
    id: `${modification.getModifiedEntityType()}-mod-${modification.id}`,
    type: 'changelog-entry',
    attributes: {
      title: actionLog.dashboardActionReason.dashboardAction.name,
      initiator: 'agent',
      occurredAt: serializeDate(modification.created),
      details,
    },
  };
};

export default serializer;
