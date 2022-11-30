import factory from '../factories';
import { clean } from '../test-helpers';
import { moment } from '@dave-inc/time-lib';
import { run } from '../../src/crons/collect-predicted-paycheck-blind-withdrawal';
import * as Tasks from '../../src/jobs/data';
import { expect } from 'chai';
import * as sinon from 'sinon';
import { SinonStub } from 'sinon';

describe('Collect Disconnected Advances Task', () => {
  const sandbox = sinon.createSandbox();
  let collectStub: SinonStub;

  before(() => clean());

  beforeEach(() => {
    collectStub = sandbox.stub(Tasks, 'performPredictedPaycheckCollection');
  });

  afterEach(() => clean(sandbox));

  it('sends a predicted-paycheck-collection task request', async () => {
    const bankConnection = await factory.create('bank-connection', {
      hasValidCredentials: false,
    });

    const bankAccount = await factory.create('bank-account', { bankConnectionId: bankConnection });

    const recurringTransaction = await factory.create('recurring-transaction', {
      bankAccountId: bankAccount,
      missed: null,
      transactionDisplayName: 'foo bar',
    });

    await bankAccount.update({ mainPaycheckRecurringTransactionId: recurringTransaction.id });

    const advance = await factory.create('advance', {
      amount: 75,
      outstanding: 75,
      paybackDate: moment()
        .subtract(2, 'month')
        .format('YYYY-MM-DD'),
      disbursementStatus: 'COMPLETED',
      bankAccountId: bankAccount.id,
    });

    await run();

    const { args } = collectStub.firstCall;

    expect(args[0]).to.deep.equal({
      advanceId: advance.id,
      bankAccountId: bankAccount.id,
      recurringTransactionId: recurringTransaction.id,
    });
  });
});
