import { expect } from 'chai';
import { clean, stubBankTransactionClient, up } from '../test-helpers';
import factory from '../factories';
import { BankAccount, BankConnection, User } from '../../src/models';
import {
  BankAccountSubtype,
  BankAccountType,
  BankingDataSource,
  MicroDeposit,
} from '@dave-inc/wire-typings';
import { moment } from '@dave-inc/time-lib';
import * as sinon from 'sinon';

describe('BankAccount', () => {
  const sandbox = sinon.createSandbox();

  before(() => clean());

  beforeEach(() => {
    stubBankTransactionClient(sandbox);
    return up();
  });
  afterEach(() => clean(sandbox));

  describe('scopes', () => {
    describe('bankOfDave', () => {
      it('only inclues bankOfDave accounts', async () => {
        const bodAccount = await factory.create('bod-checking-account');
        await Promise.all([factory.create('checking-account'), factory.create('bank-account')]);

        const results = await BankAccount.scope('bankOfDave').findAll();
        expect(results.length).to.eq(1);
        expect(results[0].id).to.eq(bodAccount.id);
      });
    });
  });

  describe('getSupportedAccountsByBankConnectionId', () => {
    it('can fetch supported bank accounts by bank connection id', async () => {
      const firstBankAccount: BankAccount = await factory.create('bank-account', {
        subtype: 'CHECKING',
      });
      const user: User = await firstBankAccount.getUser();
      const { id: secondBankId } = await factory.create('bank-account', {
        userId: user.id,
        subtype: 'CHECKING',
      });
      const firstBankAccountConnectionId = firstBankAccount.bankConnectionId;

      const rawResults: BankAccount[] = await BankAccount.getSupportedAccountsByBankConnectionId(
        firstBankAccountConnectionId,
      );

      expect(rawResults.length).to.equal(1);
      expect(rawResults[0].id).to.equal(firstBankAccount.id);
      expect(rawResults[0].id).not.to.equal(secondBankId);
    });

    it('finding by connection id only return supported banks', async () => {
      const firstAccount: BankAccount = await factory.create('bank-account', {
        subtype: 'CHECKING',
      });
      const user: User = await firstAccount.getUser();
      const bankConnectionId: number = firstAccount.bankConnectionId;
      const [secondAccount, thirdAccount, fourthAccount, fifthAccount] = await Promise.all([
        factory.create('bank-account', {
          bankConnectionId,
          userId: user.id,
          subtype: 'MONEY MARKET',
        }),
        factory.create('bank-account', {
          bankConnectionId,
          userId: user.id,
          subtype: 'SAVINGS',
        }),
        factory.create('bank-account', {
          bankConnectionId,
          userId: user.id,
          subtype: 'PREPAID',
        }),
        factory.create('bank-account', {
          bankConnectionId,
          userId: user.id,
          subtype: 'PREPAID_DEBIT',
        }),
      ]);

      const rawResults: BankAccount[] = await BankAccount.getSupportedAccountsByBankConnectionId(
        bankConnectionId,
      );
      const resultIds = rawResults.map(result => result.id);

      expect(rawResults.length, 'Expected 3 Results').to.equal(3);
      expect(resultIds, 'Expected Checking Account in Results.').contains(firstAccount.id);
      expect(resultIds, 'Expected Money Market Account not to be in results.').not.contains(
        secondAccount.id,
      );
      expect(resultIds, 'Expected Savings account not to be in results.').not.contains(
        thirdAccount.id,
      );
      expect(resultIds, 'Expected Prepaid Account to be in results.').contains(fourthAccount.id);
      expect(resultIds, 'Expected Prepaid Debit Account to be in results.').contains(
        fifthAccount.id,
      );
    });
  });

  it('excludes deleted accounts from queries, but can include a soft-deleted default account', async () => {
    const deletedDefaultAccount: BankAccount = await factory.create('bank-account', {
      subtype: 'CHECKING',
    });
    let user: User = await deletedDefaultAccount.getUser();
    await user.update({ defaultBankAccountId: deletedDefaultAccount.id });

    const [deletedNonDefault, availableNonDefault] = await Promise.all([
      factory.create('bank-account', {
        bankConnectionId: deletedDefaultAccount.bankConnectionId,
        userId: user.id,
        subtype: 'CHECKING',
      }),
      factory.create('bank-account', {
        bankConnectionId: deletedDefaultAccount.bankConnectionId,
        userId: user.id,
        subtype: 'CHECKING',
      }),
    ]);

    // Delete the accounts
    await Promise.all([deletedDefaultAccount.destroy(), deletedNonDefault.destroy()]);

    // Reload
    [user] = await Promise.all([
      await user.reload(),
      deletedDefaultAccount.reload({ paranoid: false }),
      deletedNonDefault.reload({ paranoid: false }),
    ]);

    const rawResults: BankAccount[] = await BankAccount.getSupportedAccountsByUserNotDeletedOrDefault(
      user,
    );

    const resultIds = rawResults.map(result => result.id);

    expect(deletedDefaultAccount.deleted).to.not.equal(undefined);
    expect(deletedNonDefault.deleted).to.not.equal(undefined);
    expect(availableNonDefault.deleted).to.equal(undefined);

    expect(resultIds).to.contain(deletedDefaultAccount.id);
    expect(resultIds).to.contain(availableNonDefault.id);
    expect(resultIds).to.not.contain(deletedNonDefault.id);
  });

  describe('isPrimaryAccount', async () => {
    it('should return false if the account is not primary', async () => {
      const bankAccount = await factory.create<BankAccount>('bank-account');

      expect(await bankAccount.isPrimaryAccount()).to.equal(false);
    });

    it('should return true if the account is primary', async () => {
      const bankAccount = await factory.create<BankAccount>('bank-account');

      await BankConnection.update(
        { primaryBankAccountId: bankAccount.id },
        { where: { id: bankAccount.bankConnectionId } },
      );

      expect(await bankAccount.isPrimaryAccount()).to.equal(true);
    });
  });

  describe('isSupported', async () => {
    [
      {
        type: BankAccountType.Depository,
        subtype: BankAccountSubtype.Checking,
        expected: true,
      },
      {
        type: BankAccountType.Depository,
        subtype: BankAccountSubtype.Prepaid,
        expected: true,
      },
      {
        type: BankAccountType.Depository,
        subtype: BankAccountSubtype.PrepaidDebit,
        expected: true,
      },
      {
        type: BankAccountType.Depository,
        subtype: BankAccountSubtype.Savings,
        expected: false,
      },
      {
        type: BankAccountType.Depository,
        subtype: BankAccountSubtype.Auto,
        expected: false,
      },
      {
        type: BankAccountType.Depository,
        subtype: BankAccountSubtype.Student,
        expected: false,
      },
      {
        type: BankAccountType.Depository,
        subtype: BankAccountSubtype.MoneyMarket,
        expected: false,
      },
      {
        type: BankAccountType.Credit,
        subtype: BankAccountSubtype.CreditCard,
        expected: false,
      },
      {
        type: BankAccountType.Loan,
        subtype: BankAccountSubtype.Loan,
        expected: false,
      },
    ].forEach(({ type, subtype, expected }) => {
      it(`should return ${expected} when type is ${type} and subtype is ${subtype}`, async () => {
        const bankAccount = await factory.create<BankAccount>('bank-account', {
          type,
          subtype,
        });

        expect(bankAccount.isSupported()).to.equal(expected);
      });
    });
  });

  describe('isReadyForMicroDepositManualVerification', () => {
    it('bank account with required should not be ready for micro verif earlier than 3 days during a regular week with no holidays', async () => {
      const connection = await factory.create('bank-connection');
      const user = await connection.getUser();

      const created = moment('2020-06-01 09:30-07');
      const at = moment('2020-06-04 09:29-07'); // just under three days after created
      const bankAccount = await factory.create('checking-account', {
        userId: user.id,
        microDeposit: MicroDeposit.REQUIRED,
        microDepositCreated: created,
      });
      const ready = await bankAccount.isReadyForMicroDepositManualVerification(at);
      expect(ready).to.equal(false);
    });

    it('bank account with failed should not be ready for micro verif earlier than 3 days during a regular week with no holidays', async () => {
      const connection = await factory.create('bank-connection');
      const user = await connection.getUser();

      const created = moment('2020-06-01 09:30-07');
      const at = moment('2020-06-04 09:29-07'); // just under three days after created
      const bankAccount = await factory.create('checking-account', {
        userId: user.id,
        microDeposit: MicroDeposit.REQUIRED,
        microDepositCreated: created,
      });
      const ready = await bankAccount.isReadyForMicroDepositManualVerification(at);
      expect(ready).to.equal(false);
    });

    it('bank account should not be ready for micro verif earlier than 3 days with a different timezone', async () => {
      const connection = await factory.create('bank-connection');
      const user = await connection.getUser();

      const created = moment('2020-06-01 09:30-07'); // created in PDT
      const at = moment('2020-06-04 12:29-04'); // time to check just under three days after created, but in EDT
      const bankAccount = await factory.create('checking-account', {
        userId: user.id,
        microDeposit: MicroDeposit.REQUIRED,
        microDepositCreated: created,
      });
      const ready = bankAccount.isReadyForMicroDepositManualVerification(at);
      expect(ready).to.equal(false);
    });

    it('bank account with required should be ready for micro verif after 3 days during a regular week with no holidays', async () => {
      const connection = await factory.create('bank-connection');
      const user = await connection.getUser();

      const created = moment('2020-06-01 09:30-07');
      const at = moment('2020-06-04 09:30:00.001-07'); // three days and one millisecond after created
      const bankAccount = await factory.create('checking-account', {
        userId: user.id,
        microDeposit: MicroDeposit.REQUIRED,
        microDepositCreated: created,
      });
      const ready = bankAccount.isReadyForMicroDepositManualVerification(at);
      expect(ready).to.equal(true);
    });

    it('bank account with failed should be ready for micro verif after 3 days during a regular week with no holidays', async () => {
      const connection = await factory.create('bank-connection');
      const user = await connection.getUser();

      const created = moment('2020-06-01 09:30-07');
      const at = moment('2020-06-04 09:30:00.001-07'); // three days and one millisecond after created
      const bankAccount = await factory.create('checking-account', {
        userId: user.id,
        microDeposit: MicroDeposit.FAILED,
        microDepositCreated: created,
      });
      const ready = bankAccount.isReadyForMicroDepositManualVerification(at);
      expect(ready).to.equal(true);
    });

    it('bank account should be ready for micro verif after 3 days holidays with different timezones', async () => {
      const connection = await factory.create('bank-connection');
      const user = await connection.getUser();

      const created = moment('2020-06-01 09:30-07');
      const at = moment('2020-06-04 13:30:00.001-04'); // three days and one millisecond after created in Eastern
      const bankAccount = await factory.create('checking-account', {
        userId: user.id,
        microDeposit: MicroDeposit.REQUIRED,
        microDepositCreated: created,
      });
      const ready = await bankAccount.isReadyForMicroDepositManualVerification(at);
      expect(ready).to.equal(true);
    });

    it('bank account should not be ready for micro verif earlier than 3 days over Memorial Day', async () => {
      const connection = await factory.create('bank-connection');
      const user = await connection.getUser();

      const created = moment('2020-05-22 09:30-07'); // fri before memorial day
      const at = moment('2020-05-27 09:30-07'); // 5 days after created, but weekend and holiday
      const bankAccount = await factory.create('checking-account', {
        userId: user.id,
        microDeposit: MicroDeposit.REQUIRED,
        microDepositCreated: created,
      });
      const ready = bankAccount.isReadyForMicroDepositManualVerification(at);
      expect(ready).to.equal(false);
    });

    it('bank account should be ready for micro verif after 3 business days over memorial day', async () => {
      const connection = await factory.create('bank-connection');
      const user = await connection.getUser();

      const created = moment('2020-05-22 09:30-07');
      const at = moment('2020-05-28 09:30:00.001-07'); // 6 days to account for weekend and holiday (and one milli)
      const bankAccount = await factory.create('checking-account', {
        userId: user.id,
        microDeposit: MicroDeposit.REQUIRED,
        microDepositCreated: created,
      });
      const ready = bankAccount.isReadyForMicroDepositManualVerification(at);
      expect(ready).to.equal(true);
    });

    it('should throw an error if microdeposit is required but microDepositCreated is null', async () => {
      const at = moment();
      const bankAccount = await factory.create<BankAccount>('bank-account', {
        microDepositCreated: null,
        microDeposit: MicroDeposit.REQUIRED,
      });
      expect(() => bankAccount.isReadyForMicroDepositManualVerification(at)).to.throw();
    });
  });

  describe('isDaveSpendingAccount', () => {
    it('returns true for dave checking account', async () => {
      const connection = await factory.create('bank-connection', {
        bankingDataSource: BankingDataSource.BankOfDave,
      });
      const bankAccount = await factory.create<BankAccount>('bank-account', {
        subtype: BankAccountSubtype.Checking,
        bankConnectionId: connection.id,
        userId: connection.userId,
      });

      expect(await bankAccount.isDaveSpendingAccount()).to.be.true;
    });

    it('returns false for non-checking Dave account', async () => {
      const connection = await factory.create('bank-connection', {
        bankingDataSource: BankingDataSource.BankOfDave,
      });
      const bankAccount = await factory.create<BankAccount>('bank-account', {
        subtype: BankAccountSubtype.Savings,
        bankConnectionId: connection.id,
        userId: connection.userId,
      });

      expect(await bankAccount.isDaveBanking()).to.be.true;
      expect(await bankAccount.isDaveSpendingAccount()).to.be.false;
    });

    it('returns false for non-Dave account', async () => {
      const connection = await factory.create('bank-connection', {
        bankingDataSource: BankingDataSource.Plaid,
      });
      const bankAccount = await factory.create<BankAccount>('bank-account', {
        subtype: BankAccountSubtype.Checking,
        bankConnectionId: connection.id,
        userId: connection.userId,
      });

      expect(await bankAccount.isDaveBanking()).to.be.false;
      expect(await bankAccount.isDaveSpendingAccount()).to.be.false;
    });
  });
});
