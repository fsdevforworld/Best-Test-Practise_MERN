import { Reimbursement } from '../../../../models';
import { serializeDate } from '../../../../serialization';

import { IAdvanceRefundResource } from './serialize-advance-refund';
import serializeReimbursementError from '../serialize-reimbursement-error';
import { serializeUniversalId } from '../payment-method';
import serialize from '../serialize';

const serializeAdvanceRefund: serialize<Reimbursement, IAdvanceRefundResource> = async (
  reimbursement: Reimbursement,
) => {
  return {
    id: `legacy-${reimbursement.id}`,
    type: 'advance-refund',
    attributes: {
      advanceId: reimbursement.advanceId,
      reimbursementId: reimbursement.id,
      actionLogId: `legacy-refund-action-${reimbursement.id}`,
      amount: reimbursement.amount,
      externalId: reimbursement.externalId,
      externalProcessor: reimbursement.externalProcessor,
      referenceId: reimbursement.referenceId,
      paymentMethodUniversalId: serializeUniversalId(reimbursement),
      status: reimbursement.status,
      error: serializeReimbursementError(reimbursement),
      created: serializeDate(reimbursement.created),
      updated: serializeDate(reimbursement.updated),
    },
  };
};

export default serializeAdvanceRefund;
