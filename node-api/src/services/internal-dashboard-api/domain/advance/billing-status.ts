import { moment, dateInTimezone, MOMENT_FORMATS, DEFAULT_TIMEZONE } from '@dave-inc/time-lib';

import { Advance } from '../../../../models';
import { BillingStatus, RepaymentStatus } from './statuses-and-flags';

function calculateBillingStatus(advance: Advance, repaymentStatus: RepaymentStatus): BillingStatus {
  const { disbursementStatus, outstanding, paybackDate } = advance;

  if (['OPEN', 'PAST DUE', 'ISSUE'].includes(repaymentStatus)) {
    return repaymentStatus as BillingStatus;
  }

  if (outstanding < 0) {
    return 'ISSUE';
  }

  if (disbursementStatus === 'COMPLETED') {
    if (repaymentStatus === 'COMPLETED') {
      return 'PAID';
    }

    const paybackDatetime = dateInTimezone(
      moment(paybackDate).format(MOMENT_FORMATS.YEAR_MONTH_DAY),
      DEFAULT_TIMEZONE,
    );

    const isPastPaybackDate = paybackDatetime <= moment();

    const hasOutstandingBalance = outstanding > 0;

    if (isPastPaybackDate && hasOutstandingBalance) {
      return 'PAST DUE';
    }

    if (repaymentStatus === 'PENDING') {
      return 'OPEN';
    }
  }

  if (['RETURNED', 'CANCELED', 'NOTDISBURSED'].includes(disbursementStatus) && !repaymentStatus) {
    return 'CANCELED';
  }

  return 'ISSUE';
}

export default calculateBillingStatus;
