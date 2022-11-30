import { random, sample } from 'lodash';
import { AdvanceRefundLineItem } from '../../src/models';
import { reasons } from '../../src/models/advance-refund-line-item';

export default function(factory: any) {
  factory.define('advance-refund-line-item', AdvanceRefundLineItem, {
    advanceRefundId: factory.assoc('advance-refund', 'id'),
    amount: () => random(100, true),
    reason: () => sample(reasons),
    adjustOutstanding: () => sample([true, false]),
  });
}
