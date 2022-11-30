import { expect } from 'chai';
import { Advance } from '../../../../../src/models';
import {
  getExtras,
  IAdvanceExtras,
} from '../../../../../src/services/internal-dashboard-api/domain/advance';
import factory from '../../../../factories';
import { clean } from '../../../../test-helpers';

describe('advance.getExtras', () => {
  let advanceExtras: IAdvanceExtras;

  before(async () => {
    await clean();

    const advance = await factory.create<Advance>('advance');
    advanceExtras = await getExtras(advance);
  });

  afterEach(() => clean());

  ['repaymentStatus', 'billingStatus', 'canEditPaybackDate', 'canEditTip', 'canEditFee'].forEach(
    (extra: keyof IAdvanceExtras) => {
      it(`includes ${extra}`, () => {
        expect(advanceExtras[extra]).to.exist;
      });
    },
  );
});
