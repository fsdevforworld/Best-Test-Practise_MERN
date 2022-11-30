import BigNumber from 'bignumber.js';
import { InvalidParametersError } from '../../lib/error';
import { Advance } from '../../models';
import { IAdvanceRefundRequestLineItem } from './create';

const maxOverdraftRefundAmount = 50;

async function validateLineItems(lineItems: IAdvanceRefundRequestLineItem[], advance: Advance) {
  if (!lineItems.length) {
    throw new InvalidParametersError('At least one line item must be present.');
  }

  const tip = advance.advanceTip || (await advance.getAdvanceTip());

  lineItems.forEach(lineItem => {
    const { reason, amount: amountRaw } = lineItem;
    const amount = new BigNumber(amountRaw);

    switch (reason) {
      case 'fee': {
        if (amount.gt(advance.fee)) {
          throw new InvalidParametersError('Refunded fee cannot be greater than advance fee.');
        }
        break;
      }
      case 'tip': {
        if (amount.gt(tip.amount)) {
          throw new InvalidParametersError('Refunded tip cannot be greater than advance tip.');
        }
        break;
      }
      case 'overdraft': {
        if (amount.gt(maxOverdraftRefundAmount)) {
          throw new InvalidParametersError('Refund due to overdraft cannot be greater than $50.');
        }
        break;
      }
      case 'overpayment': {
        if (amount.plus(advance.outstanding).gt(0)) {
          throw new InvalidParametersError(
            'Overpayment refund cannot exceed the outstanding amount.',
          );
        }
        break;
      }
      default:
        break;
    }
  });
}

export default validateLineItems;
