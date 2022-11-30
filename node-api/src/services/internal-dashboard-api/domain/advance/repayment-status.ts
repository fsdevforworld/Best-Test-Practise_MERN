import { moment, dateInTimezone, MOMENT_FORMATS, DEFAULT_TIMEZONE } from '@dave-inc/time-lib';
import { orderBy } from 'lodash';

import { Advance, Payment } from '../../../../models';
import { RepaymentStatus } from './statuses-and-flags';

function calculateRepaymentStatus(advance: Advance, payments: Payment[]): RepaymentStatus {
  const { disbursementStatus, outstanding, paybackDate } = advance;

  if (outstanding < 0) {
    return 'ISSUE';
  }

  const isPaymentDue = outstanding > 0;
  const hasPayments = payments?.length > 0;

  if (disbursementStatus === 'PENDING' && isPaymentDue) {
    return 'OPEN';
  }

  if (disbursementStatus === 'COMPLETED' && isPaymentDue) {
    const paybackDatetime = dateInTimezone(
      moment(paybackDate).format(MOMENT_FORMATS.YEAR_MONTH_DAY),
      DEFAULT_TIMEZONE,
    );

    const isPastPaybackDate = paybackDatetime <= moment();

    return isPastPaybackDate ? 'PAST DUE' : 'OPEN';
  }

  if (['PENDING', 'COMPLETED'].includes(disbursementStatus) && !isPaymentDue && !hasPayments) {
    return 'ISSUE';
  }

  if (hasPayments) {
    if (disbursementStatus !== 'COMPLETED') {
      return 'ISSUE';
    }

    const paymentStatuses = orderBy(payments, 'created', 'desc').map(({ status }) => status);

    // if the outstanding is 0 and there have been multiple payments, check for "successful", i.e.
    // pending or completed payments, which might not be the most recent. If any of these
    // "successful" payments is still pending, the overall repayment status is PENDING. Example: the
    // first payment is successful but another payment is initiated afterwards and then stopped
    // (canceled, charged back, etc)
    if (!isPaymentDue && payments.length > 1) {
      if (paymentStatuses.some(status => status === 'PENDING')) {
        return 'PENDING';
      }

      if (paymentStatuses.some(status => status === 'COMPLETED')) {
        return 'COMPLETED';
      }
    }

    // default to the most recent payment's status (this may let through some edge cases, but as the
    // current (pre-O2 here) majority of advances have a single payment this is a good catch-all)
    return paymentStatuses[0] as RepaymentStatus;
  }

  // if the disbursement is in a state other than 'PENDING' or 'COMPLETED' and there have been no
  // erroneous payments, the advance should not be repaid. A `null` repaymentStatus reflects this
  return null;
}

export default calculateRepaymentStatus;
