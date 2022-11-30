import { BillingStatus } from './statuses-and-flags';

function calculateCanEditFee(billingStatus: BillingStatus) {
  const hasValidStatus = ['OPEN', 'PAST DUE'].includes(billingStatus);

  return hasValidStatus;
}

export default calculateCanEditFee;
