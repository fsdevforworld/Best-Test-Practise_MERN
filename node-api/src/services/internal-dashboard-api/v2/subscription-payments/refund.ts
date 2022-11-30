import { Response } from 'express';
import { IDashboardApiResourceRequest, IDashboardV2Response } from '../../../../typings';
import { getParams } from '../../../../lib/utils';
import { SubscriptionPayment } from '../../../../../src/models';
import { InvalidParametersError, NotFoundError } from '@dave-inc/error-types';
import { subscriptionSerializers, serializeMany } from '../../serializers';
import { ExternalTransactionStatus } from '@dave-inc/wire-typings';
import { getDestination } from '../../../../../src/domain/subscription-payment';
import { createSubscriptionReimbursement } from '../../domain/reimbursement';
import { PaymentMethodId } from '@dave-inc/loomis-client';
import { processReimbursement } from '../../../../domain/reimbursement';
import { ActionCode, ActionLogPayload, validateActionLog } from '../../domain/action-log';

async function refund(
  req: IDashboardApiResourceRequest<
    SubscriptionPayment,
    { destinationId?: PaymentMethodId } & ActionLogPayload
  >,
  res: IDashboardV2Response<
    subscriptionSerializers.ISubscriptionRefundResource,
    | subscriptionSerializers.IActionLogResource
    | subscriptionSerializers.ISubscriptionBillingResource
  >,
): Promise<Response> {
  const subscriptionPayment = req.resource;
  const internalUserId = req.internalUser.id;

  const { dashboardActionReasonId, zendeskTicketUrl, note, destinationId } = getParams(
    req.body,
    ['dashboardActionReasonId', 'zendeskTicketUrl', 'note'],
    ['destinationId'],
  );

  await validateActionLog(dashboardActionReasonId, ActionCode.RefundSubscription, note);

  const destination = await getDestination(subscriptionPayment, destinationId);
  if (!destination) {
    throw new NotFoundError(`Can't find destination for reimbursement`, {
      data: {
        subscriptionPayment,
        destinationId,
      },
    });
  }

  if (subscriptionPayment.status !== ExternalTransactionStatus.Completed) {
    throw new InvalidParametersError(
      `Only payments with a status of COMPLETED can be reimbursed. Current status: ${subscriptionPayment.status}`,
    );
  }

  if (subscriptionPayment.amount > 25) {
    throw new InvalidParametersError(
      `Reimbursement amount exceeds $25 limit. Amount: ${subscriptionPayment.amount}`,
    );
  }

  const { reimbursement, dashboardActionLog } = await createSubscriptionReimbursement({
    userId: subscriptionPayment.userId,
    destination,
    amount: subscriptionPayment.amount,
    subscriptionPaymentId: subscriptionPayment.id,
    actionLogParams: {
      internalUserId,
      dashboardActionReasonId,
      zendeskTicketUrl,
      note,
    },
  });

  await processReimbursement(reimbursement);

  const billings = await subscriptionPayment.getSubscriptionBillings();

  const [serializedActionLog, serializedBillings] = await Promise.all([
    subscriptionSerializers.serializeActionLog(dashboardActionLog),
    serializeMany(billings, subscriptionSerializers.serializeSubscriptionBilling),
  ]);

  const included = [serializedActionLog, ...serializedBillings];

  const serializedRefund = await subscriptionSerializers.serializeSubscriptionRefund(
    reimbursement,
    {
      actionLog: serializedActionLog,
      subscriptionBillings: serializedBillings,
    },
  );

  const response = {
    data: serializedRefund,
    included,
  };

  return res.send(response);
}

export default refund;
