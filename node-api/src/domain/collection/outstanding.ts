import { Advance } from '../../models';
import { PaymentError } from '../../lib/error';
import { BigNumber } from 'bignumber.js';
import { ExternalTransactionStatus } from '@dave-inc/wire-typings';
import { BankAccountBalances } from '../../typings';
import { getAvailableOrCurrentBalance } from '../../lib/utils';
import getPaidAmount from './get-paid-amount';
import getRefundAmount from './get-refund-amount';
import { Transactionable } from 'sequelize/types';

const MIN_THRESHOLD = 5;
export function validateUserPaymentAmount(
  amount: number,
  balances: BankAccountBalances,
  { minThreshold = MIN_THRESHOLD }: { minThreshold?: number } = {},
): boolean {
  const balance = getAvailableOrCurrentBalance(balances);

  const remainingBalanceAfterCharge = balance - amount;

  return remainingBalanceAfterCharge >= minThreshold;
}

export function getRetrievalAmount(
  advance: Advance,
  balances: BankAccountBalances,
  {
    minThreshold = MIN_THRESHOLD,
    retrieveFullOutstanding = false,
  }: { minThreshold?: number; retrieveFullOutstanding?: boolean } = {},
): number {
  const balance = getAvailableOrCurrentBalance(balances);
  const amountDue = advance.outstanding;

  if (!balance || balance < minThreshold) {
    return null;
  }

  if (retrieveFullOutstanding) {
    return balance - minThreshold >= amountDue ? amountDue : null;
  }

  if (amountDue + minThreshold <= balance) {
    return amountDue;
  }

  return balance - (balance % 5) - minThreshold;
}

export async function validatePredictedOutstanding(advance: Advance, amount: number) {
  const [totalCollected, totalOwed] = await Promise.all([
    netCollectedAmount(advance.id),
    receivableAmount(advance),
  ]);
  const predictedOutstanding = totalOwed.minus(totalCollected).minus(amount);

  if (predictedOutstanding.isLessThan(0)) {
    throw new PaymentError('Payment amount larger than outstanding balance', {
      data: {
        paymentAmount: amount,
        totalReceivable: totalOwed,
        amountPaid: totalCollected,
      },
    });
  }
}

export async function updateOutstanding(
  advance: Advance,
  options: Transactionable = {},
): Promise<Advance> {
  const { transaction } = options;
  const outstanding = await getOutstanding(advance, { transaction });
  await advance.update({ outstanding: outstanding.toNumber() }, { transaction });
  return advance;
}

export async function getOutstanding(
  advance: Advance,
  options: Transactionable = {},
): Promise<BigNumber> {
  const { transaction } = options;
  const [totalCollected, totalOwed] = await Promise.all([
    netCollectedAmount(advance.id, { transaction }),
    receivableAmount(advance),
  ]);
  return totalOwed.minus(totalCollected);
}

async function receivableAmount(advance: Advance): Promise<BigNumber> {
  const { amount, fee } = advance;

  const advanceTip = await advance.getAdvanceTip();

  if (advance.disbursementStatus === ExternalTransactionStatus.Canceled) {
    return new BigNumber(0);
  } else {
    return new BigNumber(amount).plus(fee).plus(advanceTip.amount);
  }
}

async function netCollectedAmount(
  advanceId: number,
  options: Transactionable = {},
): Promise<BigNumber> {
  const { transaction } = options;
  const [paid, refunded] = await Promise.all([
    getPaidAmount(advanceId, { transaction }),
    getRefundAmount(advanceId, { transaction }),
  ]);

  return new BigNumber(0).plus(paid).minus(refunded);
}
