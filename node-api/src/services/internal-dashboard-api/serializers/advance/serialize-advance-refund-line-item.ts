import AdvanceRefundLineItem, { reasons } from '../../../../models/advance-refund-line-item';
import { serializeDate } from '../../../../serialization';

import { IApiResourceObject } from '../../../../typings';
import serialize from '../serialize';

export interface IAdvanceRefundLineItemResource extends IApiResourceObject {
  attributes: {
    advanceRefundId: number;
    reason: typeof reasons[number];
    amount: number;
    adjustOutstanding: boolean;
    created: string;
    updated: string;
  };
}

const serializeAdvanceRefundLineItem: serialize<
  AdvanceRefundLineItem,
  IAdvanceRefundLineItemResource
> = async (lineItem: AdvanceRefundLineItem) => {
  const { advanceRefundId, reason, amount, adjustOutstanding, created, updated } = lineItem;

  return {
    id: `${lineItem.id}`,
    type: 'advance-refund-line-item',
    attributes: {
      advanceRefundId,
      reason,
      amount,
      adjustOutstanding,
      created: serializeDate(created),
      updated: serializeDate(updated),
    },
  };
};

export default serializeAdvanceRefundLineItem;
