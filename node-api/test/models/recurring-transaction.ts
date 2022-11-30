import { RecurringTransaction } from '../../src/models';
import 'mocha';
import * as sinon from 'sinon';
import { expect } from 'chai';
import { clean, up } from '../test-helpers';

describe('RecurringTransactionModel', () => {
  const sandbox = sinon.createSandbox();

  before(() => clean());

  beforeEach(() => up());

  afterEach(() => clean(sandbox));

  it('update should update the transaction', async () => {
    await RecurringTransaction.update(
      {
        userAmount: 5000,
        pendingDisplayName: 'Bacon',
      },
      { where: { id: 100 }, returning: true },
    );
    const transaction = await RecurringTransaction.findByPk(100);
    expect(transaction.bankAccountId).to.equal(100);
    expect(transaction.userAmount).to.equal(5000);
    expect(transaction.id).to.equal(100);
    expect(transaction.pendingDisplayName).to.equal('Bacon');
  });
});
