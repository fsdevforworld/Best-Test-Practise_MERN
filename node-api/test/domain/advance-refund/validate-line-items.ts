import { Advance } from '../../../src/models';
import factory from '../../factories';
import { clean } from '../../test-helpers';
import { expect, use } from 'chai';
import chaiAsPromised from 'chai-as-promised';
import { InvalidParametersError } from '@dave-inc/error-types';
import {
  IAdvanceRefundRequestLineItem,
  validateLineItems,
} from '../../../src/domain/advance-refund';

describe('validate advance refund line items', () => {
  before(() => clean());

  afterEach(() => clean());

  let advance: Advance;

  beforeEach(async () => {
    advance = await factory.create('advance', {
      amount: 50,
      fee: 5,
      outstanding: -50,
    });
    await factory.create('advance-tip', {
      advanceId: advance.id,
      amount: 5,
    });
  });

  use(() => chaiAsPromised);

  it('should throw if no line items are passed', async () => {
    await expect(validateLineItems([], advance)).to.be.rejectedWith(
      InvalidParametersError,
      'At least one line item must be present.',
    );
  });

  it('should throw if fee refund is greater than the advance fee', async () => {
    const lineItem: IAdvanceRefundRequestLineItem = {
      reason: 'fee',
      amount: 6,
    };
    await expect(validateLineItems([lineItem], advance)).to.be.rejectedWith(
      InvalidParametersError,
      'Refunded fee cannot be greater than advance fee.',
    );
  });

  it('should throw if tip refund is greater than the advance tip', async () => {
    const lineItem: IAdvanceRefundRequestLineItem = {
      reason: 'tip',
      amount: 5.01,
    };
    await expect(validateLineItems([lineItem], advance)).to.be.rejectedWith(
      InvalidParametersError,
      'Refunded tip cannot be greater than advance tip.',
    );
  });

  it('should throw if overdraft refund is greater than $50', async () => {
    const lineItem: IAdvanceRefundRequestLineItem = {
      reason: 'overdraft',
      amount: 51,
    };
    await expect(validateLineItems([lineItem], advance)).to.be.rejectedWith(
      InvalidParametersError,
      'Refund due to overdraft cannot be greater than $50.',
    );
  });

  it('should throw if overpayment refund is greater than outstanding', async () => {
    const lineItem: IAdvanceRefundRequestLineItem = {
      reason: 'overpayment',
      amount: 51,
    };
    await expect(validateLineItems([lineItem], advance)).to.be.rejectedWith(
      InvalidParametersError,
      'Overpayment refund cannot exceed the outstanding amount.',
    );
  });

  it('should pass all checks with valid line items', async () => {
    const lineItems: IAdvanceRefundRequestLineItem[] = [
      {
        reason: 'fee',
        amount: 5,
      },
      {
        reason: 'tip',
        amount: 5,
      },
      {
        reason: 'overdraft',
        amount: 50,
      },
      {
        reason: 'overpayment',
        amount: 50,
      },
    ];

    await validateLineItems(lineItems, advance);
  });

  describe('advance with 0 outstanding', () => {
    it('should pass only tip refund', async () => {
      const noOutstandingAdvance = await factory.create('advance', {
        amount: 50,
        fee: 0,
        outstanding: 0,
      });

      await factory.create('advance-tip', {
        advanceId: noOutstandingAdvance.id,
        amount: 5,
      });

      const lineItem: IAdvanceRefundRequestLineItem = {
        reason: 'tip',
        amount: 5,
      };

      await validateLineItems([lineItem], noOutstandingAdvance);
    });
  });
});
