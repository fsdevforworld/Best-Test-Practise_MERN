import { expect } from 'chai';
import factory from '../../factories';

import { clean } from '../../test-helpers';
import calculateTipAmount from '../../../src/domain/advance-tip/calculate-tip-amount';
import { Advance } from '../../../src/models';

describe('calculateTipAmount', () => {
  before(() => clean());

  afterEach(() => clean());

  it('should return correct tip amount', async () => {
    const advance = await factory.create<Advance>('advance', { amount: 40 });

    const amount = calculateTipAmount(advance, 25);

    expect(amount).to.equal(10);
  });
});
