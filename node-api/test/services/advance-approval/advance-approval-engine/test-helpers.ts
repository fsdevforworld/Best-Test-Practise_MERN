import { ExternalTransactionStatus } from '@dave-inc/wire-typings';
import { moment } from '@dave-inc/time-lib';

import { Advance, Payment } from '../../../../src/models';

import factory from '../../../factories';

import {
  AdvanceApprovalResult,
  DecisionCase,
  DecisionNodeType,
} from '../../../../src/services/advance-approval/types';
import { DecisionNode } from '../../../../src/services/advance-approval/advance-approval-engine/decision-node';

/**
 * Generates advances and payments based on the provided params for testing purposes
 *
 * @param {number} userId
 * @param {number} bankAccountId
 * @param {number} number
 * @param {number} paybackRate
 * @returns {Promise<Advance[]>}
 */
export async function createAdvancesAndPayments({
  userId,
  bankAccountId,
  number,
  paybackRate,
}: {
  userId: number;
  bankAccountId: number;
  number: number;
  paybackRate: number;
}): Promise<Advance[]> {
  const advances = await Promise.all(
    Array(number)
      .fill(null)
      .map((value, index) => {
        const created = moment().subtract(index + 1, 'day');

        return factory.create<Advance>('advance', {
          created,
          createdDate: created,
          userId,
          bankAccountId,
          disbursementStatus: ExternalTransactionStatus.Completed,
          outstanding: 0,
          paybackDate: moment(created),
        });
      }),
  );

  await Promise.all(
    advances.map(async (advance, index) => {
      return factory.create<Payment>('payment', {
        // Set the right amount of late payments to simulate provided payback rate
        created:
          index >= Math.ceil(number * paybackRate)
            ? moment(advance.paybackDate).add(2, 'day')
            : advance.paybackDate,
        advanceId: advance.id,
        bankAccountId,
        status: ExternalTransactionStatus.Completed,
      });
    }),
  );

  return advances;
}

export class TestNode extends DecisionNode {
  public static async mockCase(): Promise<void> {
    // no-op
  }

  public cases: Array<DecisionCase<AdvanceApprovalResult>>;
  public name = 'test-helper-node';
  public type = DecisionNodeType.Static;

  constructor(mockCase = TestNode.mockCase) {
    super();
    this.cases = [mockCase];
  }
}
