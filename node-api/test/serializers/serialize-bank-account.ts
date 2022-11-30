import { expect } from 'chai';

import factory from '../factories';
import { serializeBankAccount } from '../../src/serialization';
import * as sinon from 'sinon';
import stubBankTransactionClient from '../test-helpers/stub-bank-transaction-client';

describe('toJSON', () => {
  const sandbox = sinon.createSandbox();
  beforeEach(() => stubBankTransactionClient(sandbox));
  afterEach(() => sandbox.restore());

  it('should correctly format a bank account', async () => {
    const bankAccount = await factory.create('checking-account');
    await bankAccount.reload();
    const res = await serializeBankAccount(bankAccount);

    expect(res.institution.displayName).not.to.be.null;
    expect(res.approval.incomeNeeded).to.equal(true);
    expect(res.paymentMethod).to.equal(null);
    expect(res.forecast.lowestBalance).to.equal(0);
    expect(res.forecast.startBalance).to.equal(0);
  });

  it('should fallback to current if missing available', async () => {
    const bankAccount = await factory.create('checking-account', {
      current: 500,
      available: null,
    });
    await bankAccount.reload();
    const res = await serializeBankAccount(bankAccount);
    expect(res.available).to.equal(500);
  });
});
