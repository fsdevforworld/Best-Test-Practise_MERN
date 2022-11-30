import { moment, dateInTimezone, DEFAULT_TIMEZONE } from '@dave-inc/time-lib';
import * as sinon from 'sinon';
import { ExternalTransactionStatus } from '@dave-inc/wire-typings';
import { expect } from 'chai';
import { Advance } from '../../../../../src/models';
import calculateBillingStatus from '../../../../../src/services/internal-dashboard-api/domain/advance/billing-status';
import { RepaymentStatus } from '../../../../../src/services/internal-dashboard-api/domain/advance/statuses-and-flags';
import factory from '../../../../factories';
import { clean, fakeDateTime } from '../../../../test-helpers';

const sandbox = sinon.createSandbox();

describe('advance.calculateBillingStatus', async () => {
  let advance: Advance;

  before(async () => {
    await clean(sandbox);

    advance = await factory.create<Advance>('advance');
  });

  afterEach(() => clean(sandbox));

  describe('Is the same as the repaymentStatus when repaymentStatus is', () => {
    (['OPEN', 'PAST DUE', 'ISSUE'] as RepaymentStatus[]).forEach(repaymentStatus => {
      it(`${repaymentStatus}`, () => {
        expect(calculateBillingStatus(advance, repaymentStatus)).to.equal(repaymentStatus);
      });
    });
  });

  describe('Is not the same as the repaymentStatus when repaymentStatus is', () => {
    ([
      'PENDING',
      'UNKNOWN',
      'COMPLETED',
      'RETURNED',
      'CANCELED',
      'CHARGEBACK',
    ] as RepaymentStatus[]).forEach(repaymentStatus => {
      it(`${repaymentStatus}`, () => {
        expect(calculateBillingStatus(advance, repaymentStatus)).not.to.equal(repaymentStatus);
      });
    });
  });

  it('Is ISSUE when advance.outstanding is negative', async () => {
    const overpaid = await factory.create<Advance>('advance', { outstanding: -1 });

    expect(calculateBillingStatus(overpaid, 'COMPLETED')).to.equal('ISSUE');
  });

  describe('When disbursementStatus is COMPLETED', () => {
    it('Is PAID when repaymentStatus is COMPLETED', () => {
      expect(calculateBillingStatus(advance, 'COMPLETED')).to.equal('PAID');
    });

    it('Is PAST DUE when there is an outstanding balance and the paybackDate has passed', async () => {
      const pastDue = await factory.create<Advance>('advance', {
        paybackDate: moment('2020-01-01'),
        outstanding: 10,
      });

      expect(calculateBillingStatus(pastDue, 'PENDING')).to.equal('PAST DUE');
    });

    it('uses midnight in the default timezone when calculating billing status', async () => {
      const date = '2020-01-01';

      const otherAdvance = await factory.create('advance', {
        paybackDate: '2020-01-01',
        disbursementStatus: 'COMPLETED',
        outstanding: 10,
      });

      const oneSecondBeforeMidnight = dateInTimezone(date, DEFAULT_TIMEZONE).subtract(1, 'second');

      fakeDateTime(sandbox, oneSecondBeforeMidnight);

      expect(calculateBillingStatus(otherAdvance, 'PENDING')).to.equal('OPEN');
    });

    it('Is OPEN when repaymentStatus is PENDING', () => {
      expect(calculateBillingStatus(advance, 'PENDING')).to.equal('OPEN');
    });
  });

  describe('Is CANCELED there is no repaymentStatus and disbursementStatus is', async () => {
    await Promise.all(
      (['RETURNED', 'CANCELED', 'NOTDISBURSED'] as ExternalTransactionStatus[]).map(
        async disbursementStatus => {
          it(`${disbursementStatus}`, async () => {
            const canceled = await factory.create<Advance>('advance', { disbursementStatus });

            expect(calculateBillingStatus(canceled, null)).to.equal('CANCELED');
          });
        },
      ),
    );
  });

  describe('Is ISSUE when repaymentStatus is', async () => {
    await Promise.all(
      ([
        'PENDING',
        'UNKNOWN',
        'COMPLETED',
        'RETURNED',
        'CANCELED',
        'CHARGEBACK',
      ] as RepaymentStatus[]).map(repaymentStatus => {
        context(`${repaymentStatus} and disbursementStatus is`, () => {
          (['RETURNED', 'CANCELED', 'NOTDISBURSED'] as ExternalTransactionStatus[]).map(
            async disbursementStatus => {
              it(`${disbursementStatus}`, async () => {
                const issue = await factory.create<Advance>('advance', { disbursementStatus });

                expect(calculateBillingStatus(issue, repaymentStatus)).to.equal('ISSUE');
              });
            },
          );
        });
      }),
    );
  });
});
