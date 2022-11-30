import { IApiResourceObject, IRawRelationships } from '../../../../typings';
import { Reimbursement } from '../../../../models';
import { serializeDate } from '../../../../serialization';
import serializeRelationships from '../serialize-relationships';
import serializeReimbursementError from '../serialize-reimbursement-error';
import { serializeUniversalId } from '../payment-method';
import serialize from '../serialize';

interface ISubscriptionRefundResource extends IApiResourceObject {
  type: 'subscription-refund';
  attributes: {
    subscriptionPaymentId: number;
    amount: number;
    externalId: string;
    externalProcessor: string;
    referenceId: string;
    paymentMethodUniversalId: string;
    status: string;
    error: {
      code: string;
      message: string;
    };
    created: string;
    updated: string;
    dashboardActionLogId: number | string;
  };
}

const serializeSubscriptionRefund: serialize<Reimbursement, ISubscriptionRefundResource> = async (
  reimbursement: Reimbursement,
  relationships?: IRawRelationships,
) => {
  return {
    id: `${reimbursement.id}`,
    type: 'subscription-refund',
    attributes: {
      subscriptionPaymentId: reimbursement.subscriptionPaymentId,
      amount: reimbursement.amount,
      externalId: reimbursement.externalId,
      externalProcessor: reimbursement.externalProcessor,
      referenceId: reimbursement.referenceId,
      paymentMethodUniversalId: serializeUniversalId(reimbursement),
      status: reimbursement.status,
      error: serializeReimbursementError(reimbursement),
      created: serializeDate(reimbursement.created),
      updated: serializeDate(reimbursement.updated),
      dashboardActionLogId:
        reimbursement.dashboardActionLogId || `legacy-refund-action-${reimbursement.id}`,
    },
    relationships: serializeRelationships(relationships),
  };
};

export { ISubscriptionRefundResource };
export default serializeSubscriptionRefund;
