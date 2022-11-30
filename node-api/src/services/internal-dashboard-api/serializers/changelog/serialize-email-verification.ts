import { DashboardActionLogEmailVerification } from '../../../../models';
import { serializeDate } from '../../../../serialization';
import ChangelogEntryDetail from './changelog-entry-detail';
import IChangelogEntryResource from './i-changelog-entry-resource';
import serializeActionLogDetail from './serialize-action-log-detail';

async function serializeEmailVerification(
  dashboardEmailVerification: DashboardActionLogEmailVerification,
): Promise<IChangelogEntryResource> {
  const actionLog =
    dashboardEmailVerification.dashboardActionLog ||
    (await dashboardEmailVerification.getDashboardActionLog());

  const emailVerification = dashboardEmailVerification.emailVerification;

  const serializedActionLog = await serializeActionLogDetail(actionLog);

  const details: ChangelogEntryDetail[] = [
    {
      type: 'field',
      attributes: {
        name: 'unverifiedEmail',
        value: emailVerification.email,
        dataType: 'string',
      },
    },
    serializedActionLog,
  ];

  return {
    id: `email-verification-${emailVerification.id}`,
    type: 'changelog-entry',
    attributes: {
      title: actionLog.dashboardActionReason.dashboardAction.name,
      initiator: 'agent',
      occurredAt: serializeDate(emailVerification.created),
      details,
    },
  };
}

export default serializeEmailVerification;
