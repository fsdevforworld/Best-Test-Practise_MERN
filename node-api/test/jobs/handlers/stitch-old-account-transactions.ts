import { expect } from 'chai';
import * as sinon from 'sinon';

import factory from '../../factories';
import {
  NEW_BBVA_INSTITUTION_ID,
  OLD_BBVA_INSTITUTION_ID,
  stitchOldAccountTransactions,
} from '../../../src/jobs/handlers/stitch-old-account-transactions';
import 'mocha';
import { BankAccount } from '../../../src/models';
import { moment } from '@dave-inc/time-lib';
import { clean, stubBankTransactionClient } from '../../test-helpers';
import logger from '../../../src/lib/logger';

describe('Job: stitch old account transaction', () => {
  const sandbox = sinon.createSandbox();
  let newAccount: BankAccount;
  let oldAccount: BankAccount;

  before(() => clean());

  beforeEach(async () => {
    stubBankTransactionClient(sandbox);
    try {
      newAccount = await factory.create('checking-account');
      oldAccount = await factory.create('checking-account', {
        displayName: newAccount.displayName,
        lastFour: newAccount.lastFour,
      });
      await oldAccount.update({
        userId: newAccount.userId,
        institutionId: newAccount.institutionId,
      });
    } catch (err) {
      logger.error('Failed stitching account up', { err });
    }
  });

  afterEach(() => clean(sandbox));

  it('should copy transactions from the old account if institutions are the same and account is < 60 days old', async () => {
    const oldTransaction = await factory.create('bank-transaction', {
      bankAccountId: oldAccount.id,
      transactionDate: moment()
        .subtract(90, 'days')
        .format('YYYY-MM-DD'),
    });
    await stitchOldAccountTransactions({
      bankConnectionId: newAccount.bankConnectionId,
    });
    const newTransactions = await newAccount.getBankTransactions();

    expect(newTransactions.length).to.eq(1);
    expect(newTransactions[0].externalName).to.eq(oldTransaction.externalName);
    expect(newTransactions[0].transactionDate).to.eq(oldTransaction.transactionDate);
  });

  it('should copy transactions from the old account if institutions are the same and account is < 60 days old and the old account is deleted', async () => {
    const oldTransaction = await factory.create('bank-transaction', {
      bankAccountId: oldAccount.id,
      transactionDate: moment()
        .subtract(90, 'days')
        .format('YYYY-MM-DD'),
    });
    await oldAccount.destroy();
    await stitchOldAccountTransactions({
      bankConnectionId: newAccount.bankConnectionId,
    });
    const newTransactions = await newAccount.getBankTransactions();

    expect(newTransactions.length).to.eq(1);
    expect(newTransactions[0].externalName).to.eq(oldTransaction.externalName);
    expect(newTransactions[0].transactionDate).to.eq(oldTransaction.transactionDate);
  });

  it('should copy transactions from the old account if institutions are different but are the new bbva institution id and account is < 60 days old', async () => {
    await factory.create('institution', { id: OLD_BBVA_INSTITUTION_ID }).catch(() => {});
    await factory.create('institution', { id: NEW_BBVA_INSTITUTION_ID }).catch(() => {});
    await newAccount.update({ institutionId: NEW_BBVA_INSTITUTION_ID });
    await oldAccount.update({ institutionId: OLD_BBVA_INSTITUTION_ID });
    const oldTransaction = await factory.create('bank-transaction', {
      bankAccountId: oldAccount.id,
      transactionDate: moment()
        .subtract(90, 'days')
        .format('YYYY-MM-DD'),
    });
    await stitchOldAccountTransactions({
      bankConnectionId: newAccount.bankConnectionId,
    });
    const newTransactions = await newAccount.getBankTransactions();

    expect(newTransactions.length).to.eq(1);
    expect(newTransactions[0].externalName).to.eq(oldTransaction.externalName);
    expect(newTransactions[0].transactionDate).to.eq(oldTransaction.transactionDate);
  });

  it('should not copy transactions from the old account if institutions are different and account is < 60 days old', async () => {
    const newIns = await factory.create('institution');
    await newAccount.update({ institutionId: newIns.id });
    await factory.create('bank-transaction', {
      bankAccountId: oldAccount.id,
      transactionDate: moment()
        .subtract(90, 'days')
        .format('YYYY-MM-DD'),
    });
    await stitchOldAccountTransactions({
      bankConnectionId: newAccount.bankConnectionId,
    });
    const newTransactions = await newAccount.getBankTransactions();

    expect(newTransactions.length).to.eq(0);
  });

  it('should not copy transactions from the old account if institutions are the same and account is > 60 days old', async () => {
    await factory.create('bank-transaction', {
      bankAccountId: oldAccount.id,
      transactionDate: moment()
        .subtract(90, 'days')
        .format('YYYY-MM-DD'),
    });
    await factory.create('bank-transaction', {
      bankAccountId: newAccount.id,
      transactionDate: moment()
        .subtract(80, 'days')
        .format('YYYY-MM-DD'),
    });
    await stitchOldAccountTransactions({
      bankConnectionId: newAccount.bankConnectionId,
    });
    const newTransactions = await newAccount.getBankTransactions();

    expect(newTransactions.length).to.eq(1);
  });
});
