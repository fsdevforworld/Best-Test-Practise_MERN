import { BillingStatus } from './statuses-and-flags';

function calculateCanEditTip(billingStatus: BillingStatus) {
  const hasValidStatus = ['OPEN', 'PAST DUE'].includes(billingStatus);

  return hasValidStatus;
}

export default calculateCanEditTip;
