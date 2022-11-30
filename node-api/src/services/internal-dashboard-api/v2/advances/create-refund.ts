import {
  IDashboardApiResourceRequest,
  IDashboardModification,
  IDashboardV2Response,
} from '../../../../typings';
import {
  Advance,
  DashboardActionLog,
  DashboardAdvanceModification,
  InternalUser,
} from '../../../../models';
import { advanceSerializers, serializeMany } from '../../serializers';
import { getParams } from '../../../../lib/utils';
import { InvalidParametersError, NotFoundError, UnauthorizedError } from '../../../../lib/error';
import { ALL_ADMIN_INTERNAL_ROLES } from '../../../../models/internal-role';
import {
  createAdvanceRefund,
  processAdvanceRefund,
  IAdvanceRefundRequestLineItem,
} from '../../../../domain/advance-refund';
import { get as getDestination } from '../../domain/payment-method';
import { ActionCode, ActionLogPayload, validateActionLog } from '../../domain/action-log';

type Included =
  | advanceSerializers.IAdvanceRefundResource
  | advanceSerializers.IAdvanceRefundLineItemResource;

async function createRefund(
  req: IDashboardApiResourceRequest<
    Advance,
    {
      paymentMethodUniversalId: string;
      lineItems: IAdvanceRefundRequestLineItem[];
    } & ActionLogPayload
  >,
  res: IDashboardV2Response<advanceSerializers.IAdvanceResource, Included>,
) {
  const internalUserId = req.internalUser.id;
  const advance = req.resource;

  const {
    paymentMethodUniversalId,
    lineItems,
    dashboardActionReasonId,
    zendeskTicketUrl,
    note,
  } = getParams(
    req.body,
    ['paymentMethodUniversalId', 'lineItems', 'dashboardActionReasonId', 'zendeskTicketUrl'],
    ['note'],
  );

  await Promise.all([
    validateActionLog(dashboardActionReasonId, ActionCode.CreateAdvanceRefund, note),
    validateLineItems(lineItems, req.internalUser),
  ]);

  const destination = await getDestination(paymentMethodUniversalId);

  if (!destination || destination.userId !== advance.userId) {
    throw new NotFoundError(`Can't find destination for reimbursement`, {
      data: {
        advanceId: advance.id,
        paymentMethodUniversalId,
      },
    });
  }

  const dashboardActionLog = await DashboardActionLog.create({
    internalUserId,
    dashboardActionReasonId,
    zendeskTicketUrl,
    note,
  });

  const { reimbursement, advanceRefund, advanceRefundLineItems } = await createAdvanceRefund({
    userId: advance.userId,
    destination,
    advance,
    lineItems,
    dashboardActionLogId: dashboardActionLog.id,
  });

  const previousOutstanding = advance.outstanding;

  await processAdvanceRefund(reimbursement, advance);

  if (reimbursement.status !== 'FAILED') {
    const modification: IDashboardModification = {
      outstanding: {
        previousValue: previousOutstanding,
        currentValue: advance.outstanding,
      },
    };

    await DashboardAdvanceModification.create({
      advanceId: advance.id,
      dashboardActionLogId: dashboardActionLog.id,
      modification,
    });
  }

  const [serializedRefund, serializedLineItems] = await Promise.all([
    advanceSerializers.serializeAdvanceRefund(advanceRefund),
    serializeMany(advanceRefundLineItems, advanceSerializers.serializeAdvanceRefundLineItem),
  ]);

  const included = [serializedRefund, ...serializedLineItems];
  const data = await advanceSerializers.serializeAdvance(advance, {
    advanceRefund: serializedRefund,
    advanceRefundLineItems: serializedLineItems,
  });

  const response = {
    data,
    included,
  };

  return res.send(response);
}

async function validateLineItems(
  lineItems: IAdvanceRefundRequestLineItem[],
  internalUser: InternalUser,
) {
  if (!lineItems.length) {
    throw new InvalidParametersError('At least one line item must be present.');
  }

  const roles = await internalUser.getInternalRoleNames();

  lineItems.forEach(lineItem => {
    const { reason } = lineItem;

    switch (reason) {
      case 'overdraft': {
        if (!roles.some(role => ALL_ADMIN_INTERNAL_ROLES.includes(role))) {
          throw new UnauthorizedError(
            'Only admin customer success agents may refund an advance due to overdraft.',
          );
        }
      }
      case 'overpayment': {
        if (!roles.some(role => ALL_ADMIN_INTERNAL_ROLES.includes(role))) {
          throw new UnauthorizedError(
            'Only admin customer success agents may refund an advance due to overdraft.',
          );
        }
      }
      default:
        break;
    }
  });
}

export default createRefund;
