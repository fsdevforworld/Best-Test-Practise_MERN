import { AdvanceRefund } from '../../src/models';

export default function(factory: any) {
  factory.define('advance-refund', AdvanceRefund, {
    advanceId: factory.assoc('advance', 'id'),
    reimbursementId: factory.assoc('reimbursement', 'id'),
  });
}
