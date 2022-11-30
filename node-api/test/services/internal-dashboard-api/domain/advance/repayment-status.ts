import { moment, dateInTimezone, DEFAULT_TIMEZONE } from '@dave-inc/time-lib';
import * as sinon from 'sinon';
import { ExternalTransactionStatus } from '@dave-inc/wire-typings';
import { expect } from 'chai';
import { Advance, Payment } from '../../../../../src/models';
import calculateRepaymentStatus from '../../../../../src/services/internal-dashboard-api/domain/advance/repayment-status';
import factory from '../../../../factories';
import { clean, fakeDateTime } from '../../../../test-helpers';

const sandbox = sinon.createSandbox();

describe('advance.calculateRepaymentStatus', () => {
  let payment: Payment;

  before(async () => {
    await clean(sandbox);

    payment = await factory.create<Payment>('payment');
  });

  afterEach(() => clean(sandbox));

  it('Is ISSUE when there is a negative outstanding balance', async () => {
    const overpaid = await factory.create<Advance>('advance', { outstanding: -1 });
    const overpaidStatus = calculateRepaymentStatus(overpaid, null);

    expect(overpaidStatus).to.equal('ISSUE');
  });

  it('Is OPEN when disbursementStatus is PENDING and there is an outstanding balance', async () => {
    const advance = await factory.create<Advance>('advance', {
      outstanding: 1,
      disbursementStatus: ExternalTransactionStatus.Pending,
    });

    expect(calculateRepaymentStatus(advance, null)).to.equal('OPEN');
  });

  it('Is PAST DUE when disbursementStatus is COMPLETED, there is an outstanding balance, and paybackDate has passed', async () => {
    const advance = await factory.create<Advance>('advance', {
      outstanding: 1,
      disbursementStatus: ExternalTransactionStatus.Completed,
      paybackDate: moment('2020-01-01'),
    });

    expect(calculateRepaymentStatus(advance, null)).to.equal('PAST DUE');
  });

  it('Is OPEN when disbursementStatus is COMPLETED, there is an outstanding balance, and paybackDate is in the future', async () => {
    const advance = await factory.create<Advance>('advance', {
      outstanding: 1,
      disbursementStatus: ExternalTransactionStatus.Completed,
      paybackDate: moment().add(2, 'day'),
    });

    expect(calculateRepaymentStatus(advance, null)).to.equal('OPEN');
  });

  it('uses midnight in the default timezone as the past due start time', async () => {
    const date = '2020-01-01';

    const advance = await factory.create('advance', {
      outstanding: 1,
      disbursementStatus: ExternalTransactionStatus.Completed,
      paybackDate: '2020-01-01',
    });

    const oneSecondBeforeMidnight = dateInTimezone(date, DEFAULT_TIMEZONE).subtract(1, 'second');

    fakeDateTime(sandbox, oneSecondBeforeMidnight);

    expect(calculateRepaymentStatus(advance, null)).to.equal('OPEN');
  });

  describe('Is ISSUE when there are no payment records, no outstanding balance, and disbursementStatus is', async () => {
    await Promise.all(
      (['COMPLETED', 'PENDING'] as ExternalTransactionStatus[]).map(async disbursementStatus => {
        it(`${disbursementStatus}`, async () => {
          const advance = await factory.create<Advance>('advance', {
            disbursementStatus,
            outstanding: 0,
          });

          expect(calculateRepaymentStatus(advance, null)).to.equal('ISSUE');
        });
      }),
    );
  });

  describe('Is ISSUE when there are payment records, no outstanding balance, and disbursementStatus is', async () => {
    await Promise.all(
      ([
        'RETURNED',
        'CANCELED',
        'NOTDISBURSED',
        'UNKNOWN',
        'PENDING',
      ] as ExternalTransactionStatus[]).map(async disbursementStatus => {
        it(`${disbursementStatus}`, async () => {
          const advance = await factory.create<Advance>('advance', {
            disbursementStatus,
            outstanding: 0,
          });

          expect(calculateRepaymentStatus(advance, [payment])).to.equal('ISSUE');
        });
      }),
    );
  });

  describe('When there are payment records, no outstanding balance, and disbursement status is COMPLETED', async () => {
    const [
      advance,
      oldestPending,
      olderCompleted,
      newerUnknown,
      newerReturned,
      newerCanceled,
      newestChargeback,
    ] = await Promise.all([
      factory.create<Advance>('advance', {
        disbursementStatus: ExternalTransactionStatus.Completed,
        outstanding: 0,
      }),
      factory.create<Payment>('payment', {
        status: ExternalTransactionStatus.Pending,
        created: moment().subtract(3, 'seconds'),
      }),
      factory.create<Payment>('payment', {
        status: ExternalTransactionStatus.Completed,
        created: moment().subtract(2, 'seconds'),
      }),
      factory.create<Payment>('payment', {
        status: ExternalTransactionStatus.Unknown,
        created: moment().subtract(1, 'seconds'),
      }),
      factory.create<Payment>('payment', {
        status: ExternalTransactionStatus.Returned,
        created: moment().subtract(1, 'seconds'),
      }),
      factory.create<Payment>('payment', {
        status: ExternalTransactionStatus.Canceled,
        created: moment().subtract(1, 'seconds'),
      }),
      factory.create<Payment>('payment', {
        status: ExternalTransactionStatus.Chargeback,
        created: moment(),
      }),
    ]);

    const newerGrumpyPayments = [newerUnknown, newerReturned, newerCanceled, newestChargeback];

    it('is PENDING if there are any pending payments', () => {
      expect(
        calculateRepaymentStatus(advance, [oldestPending, olderCompleted, ...newerGrumpyPayments]),
      ).to.equal('PENDING');
    });

    it('is COMPLETED if there are any completed payments and no pending payments', () => {
      expect(calculateRepaymentStatus(advance, [olderCompleted, ...newerGrumpyPayments])).to.equal(
        'COMPLETED',
      );
    });

    it('is the status of the most recent payment if there are no pending or completed payments', () => {
      expect(calculateRepaymentStatus(advance, newerGrumpyPayments)).to.equal(
        newestChargeback.status,
      );
    });
  });

  describe('Is `null` when there are no payments and disbursementStatus is', async () => {
    await Promise.all(
      (['RETURNED', 'CANCELED', 'NOTDISBURSED', 'UNKNOWN'] as ExternalTransactionStatus[]).map(
        async disbursementStatus => {
          it(`${disbursementStatus}`, async () => {
            const advance = await factory.create<Advance>('advance', { disbursementStatus });

            expect(calculateRepaymentStatus(advance, null)).to.be.null;
          });
        },
      ),
    );
  });

  describe('Is not `null` when there are no payments and disbursementStatus is', async () => {
    await Promise.all(
      (['PENDING', 'COMPLETED'] as ExternalTransactionStatus[]).map(async disbursementStatus => {
        it(`${disbursementStatus}`, async () => {
          const advance = await factory.create<Advance>('advance', { disbursementStatus });

          expect(calculateRepaymentStatus(advance, null)).not.to.be.null;
        });
      }),
    );
  });
});
