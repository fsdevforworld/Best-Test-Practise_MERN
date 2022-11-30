import * as sinon from 'sinon';
import { expect } from 'chai';

import { processTivanRepaymentResult } from '../../../src/consumers/repayment-result-processor/process-event';

import { Advance, AdvanceTip, AuditLog, PaymentMethod } from '../../../src/models';
import { TivanResult } from '../../../src/typings';

import factory from '../../factories';

import { clean } from '../../test-helpers';

const sandbox = sinon.createSandbox();

describe('processTivanRepaymentResult', () => {
  let event: any;

  beforeEach(() => {
    event = {
      ack: sandbox.stub(),
      nack: sandbox.stub(),
    } as any;
  });

  afterEach(() => sandbox.restore());

  after(() => clean(sandbox));

  it('marks successful repayments with an advance collection attempt and audit log', async () => {
    const advance = await factory.create<Advance>('advance', {
      amount: 75,
      fee: 5,
      outstanding: 85,
    });
    const advanceTip = await factory.create<AdvanceTip>('advance-tip', {
      advanceId: advance.id,
      amount: 5,
    });
    const paymentMethod = await factory.create<PaymentMethod>('payment-method', {
      bankAccountId: advance.bankAccountId,
      userId: advance.userId,
    });

    const decimalAmount = advance.amount + advance.fee + advanceTip.amount;

    const amountInPennies = decimalAmount * 100;

    const pubsubData = {
      result: TivanResult.Success,
      task: {
        advanceTasks: [{ advanceId: advance.id }],
        taskId: 'tivan-cronjob_advance-id:1',
        taskPaymentMethods: [
          {
            paymentMethodId: `DEBIT:${paymentMethod.id}`,
            taskPaymentResults: [
              {
                taskId: 'tivan-cronjob_advance-id:1',
                paymentMethodId: `DEBIT:${paymentMethod.id}`,
                taskPaymentResultId: 123,
                amountPennies: amountInPennies * -1,
                result: TivanResult.Success,
                created: new Date(),
              },
            ],
          },
        ],
      },
    };

    await processTivanRepaymentResult(event, pubsubData);

    const auditLog = await AuditLog.findOne({ where: { eventUuid: advance.id } });

    expect(auditLog.type).to.equal('TIVAN_RESULT');
    expect(auditLog.successful).to.equal(true);
  });

  it('marks failed repayments with an advance colleciton attempt and audit log', async () => {
    const advance = await factory.create<Advance>('advance', {
      amount: 75,
      fee: 5,
      outstanding: 85,
    });
    const advanceTip = await factory.create<AdvanceTip>('advance-tip', {
      advanceId: advance.id,
      amount: 5,
    });

    const amountInPennies = (advance.amount + advance.fee + advanceTip.amount) * 100;

    const pubsubData = {
      result: TivanResult.Failure,
      amount: amountInPennies,
      task: {
        advanceTasks: [{ advanceId: advance.id }],
        taskId: `tivan-cronjob_advance-id:${advance.id}`,
        taskPaymentMethods: [
          {
            paymentMethodId: 'DEBIT:123',
            taskPaymentResults: [
              {
                taskId: 'tivan-cronjob_advance-id:1',
                paymentMethodId: 'DEBIT:123',
                taskPaymentResultId: 123,
                amountPennies: amountInPennies * -1,
                result: TivanResult.Failure,
                created: new Date(),
              },
            ],
          },
        ],
      },
    };

    await processTivanRepaymentResult(event, pubsubData);
    const auditLog = await AuditLog.findOne({ where: { eventUuid: advance.id } });

    expect(auditLog.type).to.equal('TIVAN_RESULT');
    expect(auditLog.successful).to.equal(false);
  });
});
