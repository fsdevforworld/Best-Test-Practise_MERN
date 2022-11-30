import { expect } from 'chai';
import factory from '../factories';
import { matchDisbursementBankTransaction } from '../../src/jobs/handlers';
import { displayNameWhitelist } from '../../src/jobs/handlers/match-disbursement-bank-transaction';
import * as ReplicaReader from '../../src/helper/read-replica/';
import { moment } from '@dave-inc/time-lib';
import { Advance } from '../../src/models';
import { MatchDisbursementBankTransactionData } from './data';
import * as sinon from 'sinon';
import stubBankTransactionClient, {
  BankingClientStub,
} from '../test-helpers/stub-bank-transaction-client';

describe('Match disbursement bank transaction job', () => {
  const sandbox = sinon.createSandbox();
  const req = { get: () => {} } as any;

  let btStubs: BankingClientStub;
  let useReplicaStub: sinon.SinonStub;
  beforeEach(() => {
    btStubs = stubBankTransactionClient(sandbox);
    useReplicaStub = sandbox.stub(ReplicaReader, 'shouldTaskUseReadReplica').resolves();
  });
  afterEach(() => {
    sandbox.restore();
  });
  it('should match a bank transaction to a same-day advance', async () => {
    const today = moment()
      .startOf('day')
      .format('YYYY-MM-DD');
    const bankAccount = await factory.create('checking-account');
    const advance = await factory.create('advance', {
      ..._ids(bankAccount),
      amount: 55.55,
      createdDate: today,
    });
    const bankTransaction = await factory.create('bank-transaction', {
      ..._ids(bankAccount),
      displayName: 'daveroni', // Matches %dave%.
      amount: 55.55,
      transactionDate: today,
    });
    const data = {
      bankConnectionId: bankAccount.bankConnectionId,
    } as MatchDisbursementBankTransactionData;
    await matchDisbursementBankTransaction(data, req);
    const freshAdvance = await Advance.findByPk(advance.id);
    expect(freshAdvance.disbursementBankTransactionId).to.equal(bankTransaction.id);
  });

  it('should match a bank of dave bank transaction to a same-day advance', async () => {
    const today = moment()
      .startOf('day')
      .format('YYYY-MM-DD');
    const bankAccount = await factory.create('checking-account');
    const advance = await factory.create('advance', {
      ..._ids(bankAccount),
      amount: 55.55,
      createdDate: today,
    });
    const bankTransaction = await factory.create('bank-transaction', {
      ..._ids(bankAccount),
      displayName: 'Standard Advances', // Matches %dave%.
      amount: 55.55,
      transactionDate: today,
    });
    const data = {
      bankConnectionId: bankAccount.bankConnectionId,
    } as MatchDisbursementBankTransactionData;
    await matchDisbursementBankTransaction(data, req);
    const freshAdvance = await Advance.findByPk(advance.id);
    expect(freshAdvance.disbursementBankTransactionId).to.equal(bankTransaction.id);
  });

  it('should match set uuid if the bank transaction has one instead', async () => {
    const today = moment()
      .startOf('day')
      .format('YYYY-MM-DD');
    const bankAccount = await factory.create('checking-account');
    const advance = await factory.create('advance', {
      ..._ids(bankAccount),
      amount: 55.55,
      createdDate: today,
    });
    const bankTransaction = await factory.build('bank-transaction', {
      ..._ids(bankAccount),
      displayName: 'daveroni', // Matches %dave%.
      amount: 55.55,
      transactionDate: today,
    });
    bankTransaction.bankTransactionUuid = 'bacon';
    bankTransaction.id = null;
    btStubs.getBankTransactions.resolves([bankTransaction]);
    const data = {
      bankConnectionId: bankAccount.bankConnectionId,
    } as MatchDisbursementBankTransactionData;
    await matchDisbursementBankTransaction(data, req);
    const freshAdvance = await Advance.findByPk(advance.id);
    expect(freshAdvance.disbursementBankTransactionUuid).to.equal(
      bankTransaction.bankTransactionUuid,
    );
  });

  it('should match a bank transaction to a one day previous advance', async () => {
    const today = moment()
      .startOf('day')
      .format('YYYY-MM-DD');
    const bankAccount = await factory.create('checking-account');
    const advance = await factory.create('advance', {
      ..._ids(bankAccount),
      amount: 55.55,
      createdDate: today,
    });
    const bankTransaction = await factory.create('bank-transaction', {
      ..._ids(bankAccount),
      displayName: 'daveroni', // Matches %dave%.
      amount: 55.55,
      transactionDate: moment(today)
        .subtract(1, 'days')
        .format('YYYY-MM-DD'),
    });

    const data = {
      bankConnectionId: bankAccount.bankConnectionId,
    } as MatchDisbursementBankTransactionData;
    await matchDisbursementBankTransaction(data, req);

    const freshAdvance = await Advance.findByPk(advance.id);
    expect(freshAdvance.disbursementBankTransactionId).to.equal(bankTransaction.id);
  });

  it('should not match a bank transaction from another account', async () => {
    const today = moment()
      .startOf('day')
      .format('YYYY-MM-DD');
    const bankAccount1 = await factory.create('checking-account');
    const bankAccount2 = await factory.create('checking-account', {
      userId: bankAccount1.userId,
    });
    await bankAccount2.update({ bankConnectionId: bankAccount1.bankConnectionId });
    const advance = await factory.create('advance', {
      ..._ids(bankAccount1),
      amount: 55.55,
      createdDate: today,
    });
    // Necessary to make sure account is pulled job-side.
    await factory.create('bank-transaction', {
      ..._ids(bankAccount1),
      amount: 55.56,
      displayName: 'daveroni',
      transactionDate: today,
    });
    await factory.create('bank-transaction', {
      ..._ids(bankAccount2),
      amount: 55.55,
      displayName: 'daveroni',
      transactionDate: today,
    });

    const data = {
      bankConnectionId: bankAccount1.bankConnectionId,
    } as MatchDisbursementBankTransactionData;
    await matchDisbursementBankTransaction(data, req);

    const freshAdvance = await Advance.findByPk(advance.id);
    expect(freshAdvance.disbursementBankTransactionId).to.be.null;
  });

  it('should not match a bank transaction with wrong amount', async () => {
    const today = moment()
      .startOf('day')
      .format('YYYY-MM-DD');
    const bankAccount = await factory.create('checking-account');
    const advance = await factory.create('advance', {
      ..._ids(bankAccount),
      amount: 55.55,
      createdDate: today,
    });
    await factory.create('bank-transaction', {
      ..._ids(bankAccount),
      amount: 55.54,
      displayName: 'daveroni',
      transactionDate: today,
    });

    const data = {
      bankConnectionId: bankAccount.bankConnectionId,
    } as MatchDisbursementBankTransactionData;
    await matchDisbursementBankTransaction(data, req);

    const freshAdvance = await Advance.findByPk(advance.id);
    expect(freshAdvance.disbursementBankTransactionId).to.be.null;
  });

  it('should match a bank transaction 6 days after an advance', async () => {
    const today = moment()
      .startOf('day')
      .format('YYYY-MM-DD');
    const bankAccount = await factory.create('checking-account');
    const advance = await factory.create('advance', {
      ..._ids(bankAccount),
      amount: 55.55,
      createdDate: today,
    });
    const bankTransaction = await factory.create('bank-transaction', {
      ..._ids(bankAccount),
      amount: 55.55,
      displayName: 'magicBw', // Matches %cbw%.
      transactionDate: moment(today).add(6, 'days'),
    });

    const data = {
      bankConnectionId: bankAccount.bankConnectionId,
    } as MatchDisbursementBankTransactionData;
    await matchDisbursementBankTransaction(data, req);

    const freshAdvance = await Advance.findByPk(advance.id);
    expect(freshAdvance.disbursementBankTransactionId).to.equal(bankTransaction.id);
  });

  it('should not match a bank transaction much earlier than an advance', async () => {
    const today = moment()
      .startOf('day')
      .format('YYYY-MM-DD');
    const bankAccount = await factory.create('checking-account');
    const advance = await factory.create('advance', {
      ..._ids(bankAccount),
      amount: 55.55,
      createdDate: today,
    });
    await factory.create('bank-transaction', {
      ..._ids(bankAccount),
      amount: 55.55,
      displayName: 'daveroni',
      transactionDate: moment(today).subtract(2, 'days'),
    });

    const data = {
      bankConnectionId: bankAccount.bankConnectionId,
    } as MatchDisbursementBankTransactionData;
    await matchDisbursementBankTransaction(data, req);

    const freshAdvance = await Advance.findByPk(advance.id);
    expect(freshAdvance.disbursementBankTransactionId).to.be.null;
  });

  it('should not match a bank transaction 7 days after an advance', async () => {
    const today = moment()
      .startOf('day')
      .format('YYYY-MM-DD');
    const bankAccount = await factory.create('checking-account');
    const advance = await factory.create('advance', {
      ..._ids(bankAccount),
      amount: 55.55,
      createdDate: today,
    });
    await factory.create('bank-transaction', {
      ..._ids(bankAccount),
      amount: 55.55,
      displayName: 'daveroni',
      transactionDate: moment(today).add(7, 'days'),
    });

    const data = {
      bankConnectionId: bankAccount.bankConnectionId,
    } as MatchDisbursementBankTransactionData;
    await matchDisbursementBankTransaction(data, req);

    const freshAdvance = await Advance.findByPk(advance.id);
    expect(freshAdvance.disbursementBankTransactionId).to.be.null;
  });

  it('should match the latest of two eligible bank transactions to an advance', async () => {
    const today = moment()
      .startOf('day')
      .format('YYYY-MM-DD');
    const bankAccount = await factory.create('checking-account');
    const advance = await factory.create('advance', {
      ..._ids(bankAccount),
      amount: 55.55,
      createdDate: today,
    });
    await factory.create('bank-transaction', {
      ..._ids(bankAccount),
      amount: 55.55,
      displayName: 'visa transfer',
      transactionDate: moment(today).add(1, 'days'),
    });
    const bankTransaction2 = await factory.create('bank-transaction', {
      ..._ids(bankAccount),
      amount: 55.55,
      displayName: 'visa transfer',
      transactionDate: moment(today).add(2, 'days'),
    });

    const data = {
      bankConnectionId: bankAccount.bankConnectionId,
    } as MatchDisbursementBankTransactionData;
    await matchDisbursementBankTransaction(data, req);

    const freshAdvance = await Advance.findByPk(advance.id);
    expect(freshAdvance.disbursementBankTransactionId).to.equal(bankTransaction2.id);
  });

  it('should match two latest eligible bank transactions to two latest advances', async () => {
    const today = moment()
      .startOf('day')
      .format('YYYY-MM-DD');
    const bankAccount = await factory.create('checking-account');
    const advance1 = await factory.create('advance', {
      ..._ids(bankAccount),
      amount: 55.55,
      createdDate: today,
    });
    const advance2 = await factory.create('advance', {
      ..._ids(bankAccount),
      amount: 55.55,
      createdDate: moment(today).add(1, 'days'),
    });
    const bankTransaction1 = await factory.create('bank-transaction', {
      ..._ids(bankAccount),
      amount: 55.55,
      displayName: 'visa transfer',
      transactionDate: moment(today).add(1, 'days'),
    });
    const bankTransaction2 = await factory.create('bank-transaction', {
      ..._ids(bankAccount),
      amount: 55.55,
      displayName: 'visa transfer',
      transactionDate: moment(today).add(2, 'days'),
    });

    const data = {
      bankConnectionId: bankAccount.bankConnectionId,
    } as MatchDisbursementBankTransactionData;
    await matchDisbursementBankTransaction(data, req);

    const freshAdvance1 = await Advance.findByPk(advance1.id);
    const freshAdvance2 = await Advance.findByPk(advance2.id);
    expect(freshAdvance1.disbursementBankTransactionId).to.equal(bankTransaction1.id);
    expect(freshAdvance2.disbursementBankTransactionId).to.equal(bankTransaction2.id);
  });

  it('should not match an eligible bank transaction to a spoken-for advance', async () => {
    const today = moment()
      .startOf('day')
      .format('YYYY-MM-DD');
    const bankAccount = await factory.create('checking-account');
    const bankTransaction1 = await factory.create('bank-transaction', {
      ..._ids(bankAccount),
      amount: 55.55,
      displayName: 'daveroni',
      transactionDate: moment(today).add(1, 'days'),
    });
    const advance = await factory.create('advance', {
      ..._ids(bankAccount),
      amount: 55.55,
      createdDate: today,
      disbursementBankTransactionId: bankTransaction1.id,
    });
    await factory.create('bank-transaction', {
      ..._ids(bankAccount),
      amount: 55.55,
      displayName: 'daveroni',
      transactionDate: moment(today).add(2, 'days'),
    });

    const data = {
      bankConnectionId: bankAccount.bankConnectionId,
    } as MatchDisbursementBankTransactionData;
    await matchDisbursementBankTransaction(data, req);

    // Call of `.findOne` wasn't returning correct advance. SPOOKY...
    const freshAdvance = (await Advance.findAll({ where: { id: advance.id } }))[0];
    expect(freshAdvance.disbursementBankTransactionId).to.equal(bankTransaction1.id);
  });

  it('should not match a bank transaction to more than one advance in one sweep', async () => {
    const today = moment()
      .startOf('day')
      .format('YYYY-MM-DD');
    const bankAccount = await factory.create('checking-account');
    const advance1 = await factory.create('advance', {
      ..._ids(bankAccount),
      amount: 55.55,
      createdDate: today,
    });
    const advance2 = await factory.create('advance', {
      ..._ids(bankAccount),
      amount: 55.55,
      createdDate: moment(today).add(1, 'days'),
    });
    const bankTransaction1 = await factory.create('bank-transaction', {
      ..._ids(bankAccount),
      amount: 55.55,
      displayName: 'daveroni',
      transactionDate: moment(today).add(1, 'days'),
    });

    const data = {
      bankConnectionId: bankAccount.bankConnectionId,
    } as MatchDisbursementBankTransactionData;
    await matchDisbursementBankTransaction(data, req);

    const freshAdvance1 = await Advance.findByPk(advance1.id);
    const freshAdvance2 = await Advance.findByPk(advance2.id);
    expect(freshAdvance1.disbursementBankTransactionId).to.be.null;
    expect(freshAdvance2.disbursementBankTransactionId).to.equal(bankTransaction1.id);
  });

  it('should not match a bank transaction to more than one advance in two sweeps', async () => {
    const today = moment()
      .startOf('day')
      .format('YYYY-MM-DD');
    const bankAccount = await factory.create('checking-account');
    const advance1 = await factory.create('advance', {
      ..._ids(bankAccount),
      amount: 55.55,
      createdDate: today,
    });
    const advance2 = await factory.create('advance', {
      ..._ids(bankAccount),
      amount: 55.55,
      createdDate: moment(today).add(1, 'days'),
    });
    const bankTransaction1 = await factory.create('bank-transaction', {
      ..._ids(bankAccount),
      amount: 55.55,
      displayName: 'daveroni',
      transactionDate: moment(today).add(1, 'days'),
    });

    const data = {
      bankConnectionId: bankAccount.bankConnectionId,
    } as MatchDisbursementBankTransactionData;
    await matchDisbursementBankTransaction(data, req);

    const freshAdvance1 = await Advance.findByPk(advance1.id);
    const freshAdvance2 = await Advance.findByPk(advance2.id);
    expect(freshAdvance1.disbursementBankTransactionId).to.be.null;
    expect(freshAdvance2.disbursementBankTransactionId).to.equal(bankTransaction1.id);
  });

  for (const displayName of displayNameWhitelist) {
    it(`should match match bank transactions in the whitelist: ${displayName}`, async () => {
      const today = moment()
        .startOf('day')
        .format('YYYY-MM-DD');
      const bankAccount = await factory.create('checking-account');
      const advance = await factory.create('advance', {
        ..._ids(bankAccount),
        amount: 55.55,
        createdDate: today,
      });
      const bankTransaction = await factory.create('bank-transaction', {
        ..._ids(bankAccount),
        displayName,
        amount: 55.55,
        transactionDate: today,
      });

      const data = {
        bankConnectionId: bankAccount.bankConnectionId,
      } as MatchDisbursementBankTransactionData;
      await matchDisbursementBankTransaction(data, req);

      const freshAdvance = await Advance.findByPk(advance.id);
      expect(freshAdvance.disbursementBankTransactionId).to.equal(bankTransaction.id);
    });
  }
  for (const displayName of ['milk', 'big door']) {
    it(`should not match match bank transactions not on the whitelist: ${displayName}`, async () => {
      const today = moment()
        .startOf('day')
        .format('YYYY-MM-DD');
      const bankAccount = await factory.create('checking-account');
      const advance = await factory.create('advance', {
        ..._ids(bankAccount),
        amount: 55.55,
        createdDate: today,
      });
      await factory.create('bank-transaction', {
        ..._ids(bankAccount),
        displayName,
        amount: 55.55,
        transactionDate: today,
      });

      const data = {
        bankConnectionId: bankAccount.bankConnectionId,
      } as MatchDisbursementBankTransactionData;
      await matchDisbursementBankTransaction(data, req);

      const freshAdvance = await Advance.findByPk(advance.id);
      expect(freshAdvance.disbursementBankTransactionId).to.be.null;
    });
  }

  [true, false].forEach(shouldUseReadReplica => {
    it('should use read replica if specificed', async () => {
      const today = moment()
        .startOf('day')
        .format('YYYY-MM-DD');
      const bankAccount = await factory.create('checking-account');
      await factory.create('advance', {
        ..._ids(bankAccount),
        amount: 55.55,
        createdDate: today,
      });
      const data = {
        bankConnectionId: bankAccount.bankConnectionId,
      } as MatchDisbursementBankTransactionData;
      useReplicaStub.resolves(shouldUseReadReplica);

      await matchDisbursementBankTransaction(data, req);

      sandbox.assert.calledOnce(btStubs.getBankTransactions);
      const options = btStubs.getBankTransactions.firstCall.args[2];
      expect(options.useReadReplica).to.equal(shouldUseReadReplica);
    });
  });
});

type Ids = {
  bankAccountId: number;
  userId: number;
};

function _ids(bankAccount: any): Ids {
  return {
    bankAccountId: bankAccount.id,
    userId: bankAccount.userId,
  };
}
