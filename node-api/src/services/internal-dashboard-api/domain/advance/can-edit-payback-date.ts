import { BillingStatus } from './statuses-and-flags';

function calculateCanEditPaybackDate(billingStatus: BillingStatus) {
  const hasValidStatus = !['PAID', 'CANCELED'].includes(billingStatus);

  return hasValidStatus;
}

export default calculateCanEditPaybackDate;
