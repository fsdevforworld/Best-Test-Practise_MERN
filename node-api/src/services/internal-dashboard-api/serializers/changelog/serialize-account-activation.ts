import { Moment, MOMENT_FORMATS } from '@dave-inc/time-lib';
import { DashboardActionLog } from '../../../../models';
import { serializeDate } from '../../../../serialization';
import ChangelogEntryDetail from './changelog-entry-detail';
import IChangelogEntryResource from './i-changelog-entry-resource';
import serializeActionLogDetail from './serialize-action-log-detail';

async function serializeAccountActivation({
  id,
  activatedAt,
  actionLog,
}: {
  id: string;
  activatedAt: Moment;
  actionLog?: DashboardActionLog;
}): Promise<IChangelogEntryResource> {
  const details: ChangelogEntryDetail[] = [
    {
      type: 'field',
      attributes: {
        name: 'active date',
        value: serializeDate(activatedAt, MOMENT_FORMATS.YEAR_MONTH_DAY),
        dataType: 'date',
      },
    },
  ];

  if (actionLog) {
    const serializedActionLog = await serializeActionLogDetail(actionLog);
    details.push(serializedActionLog);
  }

  return {
    id,
    type: 'changelog-entry',
    attributes: {
      title: 'Account activated',
      initiator: actionLog ? 'agent' : 'user',
      status: 'ACTIVE',
      occurredAt: serializeDate(activatedAt),
      details,
    },
  };
}

export default serializeAccountActivation;
