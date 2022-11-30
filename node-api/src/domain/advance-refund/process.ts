import { Reimbursement, Advance } from '../../models';
import * as ReimbursementDomain from '../reimbursement';
import { updateOutstanding } from '../collection';

/**
 * Calls processReimbursement and, upon success, updates the advance.outstanding
 * @param reimbursement the Reimbursement for the advance refund to send to the user
 * @param advance the Advance
 */
async function processAdvanceRefund(reimbursement: Reimbursement, advance: Advance) {
  await ReimbursementDomain.processReimbursement(reimbursement);

  if (reimbursement.status !== 'FAILED') {
    await updateOutstanding(advance);
  }
}

export default processAdvanceRefund;
