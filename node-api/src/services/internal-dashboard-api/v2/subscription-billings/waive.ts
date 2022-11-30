import { Response } from 'express';
import {
  IDashboardApiResourceRequest,
  IDashboardModification,
  IDashboardV2Response,
} from '../../../../typings';
import { getParams } from '../../../../lib/utils';
import {
  DashboardActionLog,
  SubscriptionBilling,
  DashboardSubscriptionBillingModification,
  SubscriptionPayment,
  sequelize,
} from '../../../../../src/models';
import { InvalidParametersError } from '@dave-inc/error-types';
import { subscriptionSerializers } from '../../serializers';
import { canWaiveSubscriptionBilling } from '../../domain/subscription-billing';
import { ActionCode, ActionLogPayload, validateActionLog } from '../../domain/action-log';

async function waive(
  req: IDashboardApiResourceRequest<SubscriptionBilling, ActionLogPayload>,
  res: IDashboardV2Response<
    subscriptionSerializers.ISubscriptionBillingResource,
    subscriptionSerializers.ISubscriptionBillingModificationResource
  >,
): Promise<Response> {
  const subscriptionBilling = req.resource;
  const internalUserId = req.internalUser.id;

  const { dashboardActionReasonId, zendeskTicketUrl, note } = getParams(req.body, [
    'dashboardActionReasonId',
    'zendeskTicketUrl',
    'note',
  ]);

  await Promise.all([
    subscriptionBilling.reload({ include: [SubscriptionPayment] }),
    validateActionLog(dashboardActionReasonId, ActionCode.WaiveSubscription, note),
  ]);

  const canWaive = await canWaiveSubscriptionBilling(subscriptionBilling.id);

  if (!canWaive) {
    throw new InvalidParametersError(
      'Subscription billing cannot be waived: it has already been paid, waived, or refunded.',
    );
  }

  const modification: IDashboardModification = {
    amount: {
      previousValue: subscriptionBilling.amount,
      currentValue: 0,
    },
  };

  const billingModification = await sequelize.transaction(async transaction => {
    await subscriptionBilling.update({ amount: 0 }, { transaction });

    const dashboardActionLog = await DashboardActionLog.create(
      { dashboardActionReasonId, internalUserId, zendeskTicketUrl, note },
      { transaction },
    );

    return DashboardSubscriptionBillingModification.create(
      {
        subscriptionBillingId: subscriptionBilling.id,
        dashboardActionLogId: dashboardActionLog.id,
        modification,
      },
      { transaction },
    );
  });

  const serializedModification = await subscriptionSerializers.serializeSubscriptionBillingModification(
    billingModification,
  );

  const serializedBilling = await subscriptionSerializers.serializeSubscriptionBilling(
    subscriptionBilling,
    {
      modification: serializedModification,
    },
  );

  const response = {
    data: serializedBilling,
    included: [serializedModification],
  };

  return res.send(response);
}

export default waive;
