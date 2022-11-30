import { capitalize } from 'lodash';
import {
  AdvanceRefund,
  DashboardAction,
  DashboardAdvanceModification,
  Reimbursement,
} from '../../../../models';
import { serializeDate } from '../../../../serialization';
import { ActionCode } from '../../domain/action-log';
import { serializeUniversalId, serializeDisplayName } from '../payment-method';
import ChangelogEntryDetail from './changelog-entry-detail';
import IChangelogEntryResource from './i-changelog-entry-resource';
import IFieldDetail from './i-field-detail';
import serializeActionLogDetail from './serialize-action-log-detail';
import serializeModificationDetails from './serialize-modification-details';

async function serializeAdvanceRefund(
  advanceRefund: AdvanceRefund,
): Promise<IChangelogEntryResource> {
  const [refund, lineItems] = await Promise.all([
    advanceRefund.reimbursement ||
      advanceRefund.getReimbursement({
        include: [{ model: Reimbursement.scope('withDashboardAction') }],
      }),
    advanceRefund.advanceRefundLineItems || advanceRefund.getAdvanceRefundLineItems(),
  ]);

  // the actionLog.reason for refunding advances is "Refund". The lineItem.reason entries are the
  // refund types the agent selected in the UI, i.e. 'fee', 'tip', 'overpayment', 'overdraft'
  const lineItemReasons = capitalize(lineItems.map(lineItem => lineItem.reason).join(', '));

  const actionLog = refund.dashboardActionLog;

  const destinationUniversalId = serializeUniversalId(refund);
  const destination = await serializeDisplayName(destinationUniversalId);

  const serializedFields: IFieldDetail[] = [
    {
      type: 'field',
      attributes: {
        name: 'amount',
        value: refund.amount,
        dataType: 'dollar',
      },
    },
    {
      type: 'field',
      attributes: {
        name: 'sentTo',
        value: destination,
        dataType: 'string',
      },
    },
  ];

  const details: ChangelogEntryDetail[] = [...serializedFields];

  // some refunds are done by script and therefore do not have any dashboard auditing information
  if (actionLog) {
    const modification = await DashboardAdvanceModification.findOne({
      where: { dashboardActionLogId: actionLog.id },
    });

    const serializedModifications = serializeModificationDetails(modification?.modification || {});

    const serializedActionLog = await serializeActionLogDetail(actionLog);
    serializedActionLog.attributes.reason = lineItemReasons;

    details.push(...serializedModifications, serializedActionLog);
  } else {
    const reason: IFieldDetail = {
      type: 'field',
      attributes: {
        name: 'reason',
        value: lineItemReasons,
        dataType: 'string',
      },
    };

    details.push(reason);
  }

  const title =
    actionLog?.dashboardActionReason.dashboardAction.name ||
    (
      await DashboardAction.findOne({
        where: { code: ActionCode.CreateAdvanceRefund },
      })
    )?.name;

  return {
    id: `advance-refund-${advanceRefund.id}`,
    type: 'changelog-entry',
    attributes: {
      title,
      initiator: actionLog ? 'agent' : 'system',
      occurredAt: serializeDate(advanceRefund.created),
      details,
      status: refund.status,
    },
  };
}

export default serializeAdvanceRefund;
