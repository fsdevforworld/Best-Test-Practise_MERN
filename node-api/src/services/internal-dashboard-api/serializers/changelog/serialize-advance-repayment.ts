import { DashboardAdvanceRepayment } from '../../../../models';
import { serializeDate } from '../../../../serialization';
import { serializeDisplayName } from '../payment-method';
import ChangelogEntryDetail from './changelog-entry-detail';
import IChangelogEntryResource from './i-changelog-entry-resource';
import serializeActionLogDetail from './serialize-action-log-detail';

async function serializeAdvanceRepayment(
  advanceRepayment: DashboardAdvanceRepayment,
): Promise<IChangelogEntryResource> {
  const actionLog =
    advanceRepayment.dashboardActionLog || (await advanceRepayment.getDashboardActionLog());

  const paymentSource = await serializeDisplayName(advanceRepayment.paymentMethodUniversalId);

  const serializedActionLog = await serializeActionLogDetail(actionLog);

  const details: ChangelogEntryDetail[] = [
    {
      type: 'field',
      attributes: {
        name: 'amount',
        value: advanceRepayment.amount,
        dataType: 'dollar',
      },
    },
    {
      type: 'field',
      attributes: {
        name: 'collectFrom',
        value: paymentSource,
        dataType: 'string',
      },
    },
    serializedActionLog,
  ];

  return {
    id: `advance-repayment-${advanceRepayment.tivanTaskId}`,
    type: 'changelog-entry',
    attributes: {
      title: actionLog.dashboardActionReason.dashboardAction.name,
      initiator: 'agent',
      occurredAt: serializeDate(advanceRepayment.created),
      details,
      status: advanceRepayment.status,
    },
  };
}

export default serializeAdvanceRepayment;
