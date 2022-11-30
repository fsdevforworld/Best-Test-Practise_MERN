import { expect } from 'chai';
import factory from '../../factories';

import { clean } from '../../test-helpers';
import calculateTipPercent from '../../../src/domain/advance-tip/calculate-tip-percent';
import { Advance } from '../../../src/models';

describe('calculateTipAmount', () => {
  before(() => clean());

  afterEach(() => clean());

  it('should return correct tip percent', async () => {
    const advance = await factory.create<Advance>('advance', { amount: 40 });

    const percent = calculateTipPercent(advance, 10);

    expect(percent).to.equal(25);
  });
});
