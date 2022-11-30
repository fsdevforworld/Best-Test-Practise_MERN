import { flatten } from 'lodash';
import { IDashboardApiResourceRequest, IDashboardV2Response } from '../../../../typings';
import {
  Advance,
  DashboardAdvanceModification,
  AdvanceRefund,
  DashboardAdvanceRepayment,
  DashboardPaymentModification,
} from '../../../../models';
import { serializeMany, changelogSerializers } from '../../serializers';
import { ActionCode } from '../../domain/action-log';
import * as Bluebird from 'bluebird';

type ChangelogResource = changelogSerializers.IChangelogEntryResource;

async function getChangelog(
  req: IDashboardApiResourceRequest<Advance>,
  res: IDashboardV2Response<ChangelogResource[]>,
) {
  const { id: advanceId } = req.resource;

  const [modifications, refunds, repayments, paymentModifications] = await Promise.all([
    DashboardAdvanceModification.scope('withDashboardAction').findAll({ where: { advanceId } }),
    AdvanceRefund.scope('withChangelogData').findAll({ where: { advanceId } }),
    DashboardAdvanceRepayment.scope('withDashboardAction').findAll({ where: { advanceId } }),
    DashboardPaymentModification.scope([
      'withDashboardAction',
      { method: ['forAdvanceId', advanceId] },
    ]).findAll(),
  ]);

  const paymentStatusChanges = paymentModifications.filter(
    modification =>
      modification.dashboardActionLog.dashboardActionReason.dashboardAction.code ===
      ActionCode.AdvancePaymentStatusChange,
  );

  await Bluebird.each(paymentStatusChanges, paymentStatusChange => {
    const advanceOutstandingModification = modifications.find(
      advanceModification =>
        advanceModification.dashboardActionLogId === paymentStatusChange.dashboardActionLogId,
    );

    // Some of our old matching advance modifications do not have a modification.outstanding
    if (advanceOutstandingModification?.modification?.outstanding) {
      paymentStatusChange.modification = {
        ...paymentStatusChange.modification,
        advanceOutstanding: advanceOutstandingModification.modification.outstanding,
      };
    }
  });

  const filteredModifications = modifications.filter(
    modification =>
      ![ActionCode.CreateAdvanceRefund, ActionCode.AdvancePaymentStatusChange].includes(
        modification.dashboardActionLog.dashboardActionReason.dashboardAction.code as ActionCode,
      ),
  );

  const serializedResourcesByType = await Promise.all([
    serializeMany(filteredModifications, changelogSerializers.serializeModification),
    serializeMany(refunds, changelogSerializers.serializeAdvanceRefund),
    serializeMany(repayments, changelogSerializers.serializeAdvanceRepayment),
    serializeMany(paymentStatusChanges, changelogSerializers.serializeModification, {
      modificationNames: { status: 'paymentStatus' },
    }),
  ]);

  const data = flatten<ChangelogResource>(serializedResourcesByType);

  res.send({
    data,
  });
}

export default getChangelog;
