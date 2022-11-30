import 'mocha';
import * as sinon from 'sinon';
import { expect } from 'chai';
import { PaymentMethodType } from '@dave-inc/loomis-client';
import { moment } from '@dave-inc/time-lib';
import { Advance } from '../../../src/models';
import {
  TaskInterleaved,
  TivanProcess,
  TivanResult,
  TivanPaymentStatus,
  getTivanClient,
} from '../../../src/lib/tivan-client';
import { AdvanceCollectionTrigger } from '../../../src/typings';
import {
  createTaskId,
  createAdvanceRepaymentTask,
  createUserPaymentTask,
  getTaskStatus,
  waitForTaskResult,
} from '../../../src/domain/repayment/tasks';
import { stubTivanClient } from '../../test-helpers/stub-tivan-client';

describe('domain/repayments/tasks', () => {
  const sandbox = sinon.createSandbox();

  afterEach(() => sandbox.restore());

  it('create task id', () => {
    const time = moment(123456789000);
    const taskId = createTaskId(1000, 'test-trigger', time);
    expect(taskId).to.equal('tivan-test-trigger_advance-id_1000-123456789');
  });

  it('should create Advance Repayment task', async () => {
    const fakeAdvance = {
      id: 999,
      userId: 5050,
    } as Advance;
    const enqueueTaskStub = stubTivanClient(sandbox).enqueueTask;
    await createAdvanceRepaymentTask(fakeAdvance, AdvanceCollectionTrigger.DAILY_CRONJOB);

    sandbox.assert.calledOnce(enqueueTaskStub);
    const [taskArg] = enqueueTaskStub.firstCall.args;
    expect(taskArg).to.deep.equal({
      userId: fakeAdvance.userId,
      advanceId: fakeAdvance.id,
      process: TivanProcess.Advance,
      source: AdvanceCollectionTrigger.DAILY_CRONJOB,
    });
  });

  it('should create bank account update Advance Repayment task', async () => {
    const fakeAdvance = {
      id: 999,
      userId: 5050,
    } as Advance;
    const enqueueTaskStub = stubTivanClient(sandbox).enqueueTask;
    await createAdvanceRepaymentTask(fakeAdvance, AdvanceCollectionTrigger.BANK_ACCOUNT_UPDATE);

    sandbox.assert.calledOnce(enqueueTaskStub);
    const [taskArg] = enqueueTaskStub.firstCall.args;
    expect(taskArg).to.deep.equal({
      userId: fakeAdvance.userId,
      advanceId: fakeAdvance.id,
      process: TivanProcess.AdvanceUseCurrentBalance,
      source: AdvanceCollectionTrigger.BANK_ACCOUNT_UPDATE,
    });
  });

  it('should create Advance With Payment task', async () => {
    const fakeAdvance = {
      id: 999,
      userId: 5050,
    } as Advance;
    const paymentMethodId = {
      type: PaymentMethodType.DEBIT_CARD,
      id: 23,
    };
    const amount = 64.1;

    const enqueueApiTaskStub = stubTivanClient(sandbox).enqueueApiTask;
    await createUserPaymentTask(
      fakeAdvance,
      AdvanceCollectionTrigger.USER,
      paymentMethodId,
      amount,
    );

    sandbox.assert.calledOnce(enqueueApiTaskStub);
    const [taskArg] = enqueueApiTaskStub.firstCall.args;
    expect(taskArg).to.deep.equal({
      userId: fakeAdvance.userId,
      advanceId: fakeAdvance.id,
      process: TivanProcess.AdvanceWithPayment,
      source: AdvanceCollectionTrigger.USER,
      payment: {
        paymentMethodId: 'DEBIT:23',
        amount,
      },
    });
  });

  it('should accept custom ID for Advance Repayment task ', async () => {
    const fakeAdvance = {
      id: 999,
      userId: 5050,
    } as Advance;
    const options = {
      taskId: 'my-test-id',
    };
    const enqueueTaskStub = stubTivanClient(sandbox).enqueueTask;
    await createAdvanceRepaymentTask(fakeAdvance, AdvanceCollectionTrigger.DAILY_CRONJOB, options);

    sandbox.assert.calledOnce(enqueueTaskStub);
    const taskOptions = enqueueTaskStub.firstCall.args[1];
    expect(taskOptions.taskId).to.equal(options.taskId);
  });

  it('should accept custom ID for Advance With Payment task', async () => {
    const fakeAdvance = {
      id: 999,
      userId: 5050,
    } as Advance;
    const paymentMethodId = {
      type: PaymentMethodType.DEBIT_CARD,
      id: 23,
    };
    const options = {
      taskId: 'my-with-payments-test-id',
    };
    const amount = 64.1;

    const enqueueApiTaskStub = stubTivanClient(sandbox).enqueueApiTask;
    await createUserPaymentTask(
      fakeAdvance,
      AdvanceCollectionTrigger.USER,
      paymentMethodId,
      amount,
      options,
    );

    sandbox.assert.calledOnce(enqueueApiTaskStub);
    const taskOptions = enqueueApiTaskStub.firstCall.args[1];
    expect(taskOptions.taskId).to.equal(options.taskId);
  });

  describe('task status', () => {
    let getTaskStub: sinon.SinonStub;

    beforeEach(() => {
      getTaskStub = sandbox.stub(getTivanClient(), 'task');
    });

    it('should get most recent status from task', async () => {
      const fakeTask = {
        taskAttempts: [
          {
            taskAttemptResults: [
              {
                created: new Date().setMilliseconds(Date.now() - 100000),
                result: TivanResult.Error,
              },
            ],
          },
          {
            taskAttemptResults: [
              {
                created: new Date(),
                result: TivanResult.Failure,
              },
            ],
          },
        ],
      } as TaskInterleaved;

      getTaskStub.resolves(fakeTask);
      const status = await getTaskStatus('foo');
      expect(status.result).to.equal(TivanResult.Failure);
    });

    it('should return nothing when task has no completed attempts', async () => {
      getTaskStub.resolves({});
      const status = await getTaskStatus('foo');
      expect(status).to.be.undefined;
    });

    it('should return successful payments with Success or Pending status', async () => {
      const fakeTask = {
        taskAttempts: [
          {
            taskAttemptResults: [
              {
                created: new Date(),
                result: TivanResult.Success,
              },
            ],
          },
        ],
        taskPaymentMethods: [
          {
            taskPaymentResults: [
              {
                paymentMethodId: 'pm1',
                result: TivanPaymentStatus.Error,
              },
              {
                paymentMethodId: 'pm2',
                result: TivanPaymentStatus.Success,
              },
            ],
          },
          {
            taskPaymentResults: [
              {
                paymentMethodId: 'pm3',
                result: TivanPaymentStatus.Pending,
              },
            ],
          },
        ],
      } as TaskInterleaved;

      getTaskStub.resolves(fakeTask);
      const status = await getTaskStatus('foo');
      expect(status.result).to.equal(TivanResult.Success);
      expect(status.successfulPayments?.length).to.equal(2);

      const paymentIds = status.successfulPayments.map(p => p.paymentMethodId);
      expect(paymentIds.sort()).to.deep.equal(['pm2', 'pm3']);
    });

    it('should wait for task result', async () => {
      getTaskStub.onFirstCall().resolves({});
      getTaskStub.onSecondCall().resolves({
        taskAttempts: [
          {
            taskAttemptResults: [
              {
                created: new Date(),
                result: TivanResult.Success,
              },
            ],
          },
        ],
      });

      const start = Date.now();
      // 1s timeout, 100ms between attempts
      const result = await waitForTaskResult('foo', 1, 0.1);
      const end = Date.now();

      expect(end - start).to.be.lessThan(300);
      expect(result.result).to.equal(TivanResult.Success);
      sandbox.assert.calledTwice(getTaskStub);
    });

    it('should stop waiting at timeout', async () => {
      getTaskStub.onFirstCall().resolves({});
      getTaskStub.onSecondCall().resolves({});
      getTaskStub.onThirdCall().resolves({});
      getTaskStub.onCall(4).resolves({
        taskAttempts: [
          {
            taskAttemptResults: [
              {
                created: new Date(),
                result: TivanResult.Success,
              },
            ],
          },
        ],
      });

      const start = Date.now();
      // 2s timeout, 700ms between attempts
      const result = await waitForTaskResult('foo', 2, 0.7);
      const end = Date.now();

      expect(end - start).to.be.lessThan(2000);
      expect(result).to.be.undefined;
    });
  });
});
