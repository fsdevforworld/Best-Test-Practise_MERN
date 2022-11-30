import { AdvanceRefund } from '../../../../models';
import { serializeDate } from '../../../../serialization';

import { IApiResourceObject } from '../../../../typings';
import serializeReimbursementError from '../serialize-reimbursement-error';
import { serializeUniversalId } from '../payment-method';
import serialize from '../serialize';

export interface IAdvanceRefundResource extends IApiResourceObject {
  type: 'advance-refund';
  attributes: {
    advanceId: number;
    reimbursementId: number;
    actionLogId: number | string;
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
  };
}

const serializeAdvanceRefund: serialize<AdvanceRefund, IAdvanceRefundResource> = async (
  advanceRefund: AdvanceRefund,
) => {
  const { advanceId, reimbursementId, created } = advanceRefund;
  const reimbursement = advanceRefund.reimbursement || (await advanceRefund.getReimbursement());

  return {
    id: `${advanceRefund.id}`,
    type: 'advance-refund',
    attributes: {
      advanceId,
      reimbursementId,
      actionLogId: reimbursement.dashboardActionLogId,
      amount: reimbursement.amount,
      externalId: reimbursement.externalId,
      externalProcessor: reimbursement.externalProcessor,
      referenceId: reimbursement.referenceId,
      paymentMethodUniversalId: serializeUniversalId(reimbursement),
      status: reimbursement.status,
      error: serializeReimbursementError(reimbursement),
      created: serializeDate(created),
      updated: serializeDate(reimbursement.updated),
    },
  };
};

export default serializeAdvanceRefund;
