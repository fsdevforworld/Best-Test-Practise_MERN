import { Advance } from '../../../../models';
import calculateBillingStatus from './billing-status';
import calculateCanEditFee from './can-edit-fee';
import calculateCanEditPaybackDate from './can-edit-payback-date';
import calculateCanEditTip from './can-edit-tip';
import calculateRepaymentStatus from './repayment-status';

// we don't want to mix enums and strings in RepaymentStatus, so no ExternalTransactionStatus here
type PaymentStatuses = 'PENDING' | 'UNKNOWN' | 'COMPLETED' | 'RETURNED' | 'CANCELED' | 'CHARGEBACK';
type RepaymentStatus = PaymentStatuses | 'OPEN' | 'PAST DUE' | 'ISSUE';
type BillingStatus = 'OPEN' | 'PAID' | 'PAST DUE' | 'CANCELED' | 'ISSUE';

interface IAdvanceExtras {
  repaymentStatus: RepaymentStatus;
  billingStatus: BillingStatus;
  canEditPaybackDate: boolean;
  canEditTip: boolean;
  canEditFee: boolean;
}

async function getStatusesAndFlags(advance: Advance): Promise<IAdvanceExtras> {
  const payments = await advance.getPayments();

  const repaymentStatus = calculateRepaymentStatus(advance, payments);
  const billingStatus = calculateBillingStatus(advance, repaymentStatus);
  const canEditPaybackDate = calculateCanEditPaybackDate(billingStatus);
  const canEditTip = calculateCanEditTip(billingStatus);
  const canEditFee = calculateCanEditFee(billingStatus);

  return {
    repaymentStatus,
    billingStatus,
    canEditPaybackDate,
    canEditTip,
    canEditFee,
  };
}

export { BillingStatus, IAdvanceExtras, RepaymentStatus };
export default getStatusesAndFlags;
