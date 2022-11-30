import { Advance, Payment, Reimbursement, SubscriptionPayment } from '../../../../../models';
import serializeAdvanceDestinationId from './serialize-advance-destination-id';
import serializeSourceUniversalId from './serialize-source-universal-id';
import serializeReimbursementDestinationId from './serialize-reimbursement-destination-id';

function serializeUniversalId(obj: Advance | Reimbursement | Payment | SubscriptionPayment) {
  if (obj instanceof Advance) {
    return serializeAdvanceDestinationId(obj);
  }

  if (obj instanceof Reimbursement) {
    return serializeReimbursementDestinationId(obj);
  }

  return serializeSourceUniversalId(obj);
}

export default serializeUniversalId;
