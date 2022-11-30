import * as Bluebird from 'bluebird';
import * as sinon from 'sinon';
import factory from '../factories';
import { expect } from 'chai';
import { DEFAULT_TIMEZONE, moment } from '@dave-inc/time-lib';
import * as Tabapay from '../../src/lib/tabapay';
import SynpasePayNodeLib from '../../src/domain/synapsepay/node';
import SynapsepayNodeLib from '../../src/domain/synapsepay/node';
import {
  Advance,
  AdvanceCollectionAttempt,
  AuditLog,
  BankConnection,
  Payment,
  PaymentMethod,
} from '../../src/models';
import { clean, stubBalanceLogClient, stubLoomisClient } from '../test-helpers';
import BankAccount from '../../src/models/bank-account';
import * as ACH from '../../src/domain/collection/ach';
import * as Collection from '../../src/domain/collection';

import {
  AdvanceDelivery,
  BankAccountSubtype,
  BankingDataSource,
  ExternalTransactionStatus,
} from '@dave-inc/wire-typings';
import { bankTransactionsDidUpdate } from '../../src/helper/bank-account';
import { collectAfterBankAccountUpdate } from '../../src/jobs/handlers/collect-after-bank-account-update';
import { MAX_JOB_AGE_MINS } from '../../src/jobs/handlers/collect-after-bank-account-update/helpers';
import * as Jobs from '../../src/jobs/data';
import { BalanceLogCaller } from '../../src/typings';
import stubBankTransactionClient from '../test-helpers/stub-bank-transaction-client';

describe('Collect After Bank Account Update', () => {
  const sandbox = sinon.createSandbox();

  const JOB_NAME = 'COLLECT_AFTER_BANK_ACCOUNT_UPDATE';

  before(() => clean());

  beforeEach(() => {
    stubBankTransactionClient(sandbox);
    stubLoomisClient(sandbox);
  });

  afterEach(() => clean(sandbox));

  describe('Task queue', () => {
    let createTaskStub: sinon.SinonStub;
    beforeEach(() => {
      createTaskStub = sandbox.stub(Jobs, 'createMatchDisbursementBankTransactionTask');
    });

    it('is enqueued during the bankTransactionsDidUpdate event', async () => {
      stubBalanceLogClient(sandbox);

      const queueSpy = sandbox.stub(Jobs, 'createCollectAfterBankAccountUpdateTask');

      const bankConnection = await factory.create<BankConnection>('bank-connection');
      const bankAccounts = await factory.createMany<BankAccount>('checking-account', 2, {
        bankConnectionId: bankConnection.id,
        userId: bankConnection.userId,
        institutionId: bankConnection.institutionId,
      });

      await bankTransactionsDidUpdate(
        bankConnection,
        bankAccounts,
        moment().format('YYYY-MM-DD HH:mm:ss'),
        {
          caller: BalanceLogCaller.PlaidUpdaterPubsub,
          shouldCollect: true,
        },
      );

      expect(queueSpy.callCount).to.equal(2);
      sinon.assert.calledOnce(createTaskStub);
      sinon.assert.calledWith(createTaskStub, { bankConnectionId: bankConnection.id });
    });
  });

  describe('collect after bank account update', () => {
    it('does not collect if message is expired', async () => {
      const advance = await createAdvance({
        amount: 75,
        fee: 5,
        tipPercent: 10,
      });

      await BankAccount.update(
        { subtype: BankAccountSubtype.Savings },
        { where: { id: advance.bankAccountId } },
      );
    });
    it('does not collect if bank account is not supported', async () => {
      const advance = await createAdvance({
        amount: 75,
        fee: 5,
        tipPercent: 10,
      });

      await BankAccount.update(
        { subtype: BankAccountSubtype.Savings },
        { where: { id: advance.bankAccountId } },
      );

      const bankAccountId = advance.bankAccountId;

      const collectSpy = sandbox.spy(Collection, 'collectAdvance');

      await collectAfterBankAccountUpdate({
        bankAccountId,
        updatedAt: moment()
          .subtract(MAX_JOB_AGE_MINS + 1, 'minutes')
          .format(),
      });

      sinon.assert.notCalled(collectSpy);
    });

    it('does not collect if bank account is not primary account', async () => {
      const advance = await createAdvance({
        amount: 75,
        fee: 5,
        tipPercent: 10,
      });

      const bankAccount = await advance.getBankAccount();

      await BankConnection.update(
        { primaryBankAccountId: null },
        { where: { id: bankAccount.bankConnectionId } },
      );

      const bankAccountId = advance.bankAccountId;

      const collectSpy = sandbox.spy(Collection, 'collectAdvance');

      await collectAfterBankAccountUpdate({ bankAccountId, updatedAt: moment().format() });

      sinon.assert.notCalled(collectSpy);
    });

    it('collects outstanding amount when available', async () => {
      const advance = await createAdvance({
        amount: 75,
        fee: 5,
        tipPercent: 10,
      });

      const outstanding = advance.outstanding;

      sandbox.stub(Tabapay, 'retrieve').resolves({
        status: 'COMPLETED',
        id: 'foo-bar',
      });

      const bankAccountId = advance.bankAccountId;

      await collectAfterBankAccountUpdate({ bankAccountId, updatedAt: moment().format() });

      const [updatedAdvance, [payment]] = await Bluebird.all([
        Advance.findByPk(advance.id),
        Payment.findAll({ where: { advanceId: advance.id } }),
      ]);

      expect(updatedAdvance.outstanding).to.equal(0);
      expect(payment.amount).to.equal(outstanding);
    });

    it('collects all advances that are due, EVEN IF they have a scheduled window', async () => {
      const advance = await createAdvance({
        amount: 75,
        fee: 5,
        tipPercent: 10,
      });

      const outstanding = advance.outstanding;

      await factory.create('advance-collection-schedule', {
        advanceId: advance.id,
      });

      sandbox.stub(Tabapay, 'retrieve').resolves({
        status: 'COMPLETED',
        id: 'foo-bar',
      });

      const bankAccountId = advance.bankAccountId;

      await collectAfterBankAccountUpdate({ bankAccountId, updatedAt: moment().format() });

      const [updatedAdvance, [payment]] = await Bluebird.all([
        Advance.findByPk(advance.id),
        Payment.findAll({ where: { advanceId: advance.id } }),
      ]);

      expect(updatedAdvance.outstanding).to.equal(0);
      expect(payment.amount).to.equal(outstanding);
    });

    it('logs success', async () => {
      const advance = await createAdvance({
        amount: 75,
        fee: 5,
        tipPercent: 10,
      });

      sandbox.stub(Tabapay, 'retrieve').resolves({
        status: 'COMPLETED',
        id: 'foo-bar-' + moment().unix(),
      });

      const bankAccountId = advance.bankAccountId;

      await collectAfterBankAccountUpdate({ bankAccountId, updatedAt: moment().format() });

      const [log] = (await AuditLog.findAll({ where: { userId: advance.userId } })).filter(l => {
        return l.type === JOB_NAME;
      });

      expect(log.successful).to.equal(true);
      expect(log.eventUuid).to.equal(`${advance.id}`);
    });

    it('logs failure', async () => {
      const advance = await createAdvance({
        amount: 75,
        fee: 5,
        tipPercent: 10,
      });

      sandbox.stub(Tabapay, 'retrieve').rejects();
      sandbox.stub(SynpasePayNodeLib, 'charge').rejects();

      const bankAccountId = advance.bankAccountId;

      await collectAfterBankAccountUpdate({ bankAccountId, updatedAt: moment().format() });

      const [log] = (await AuditLog.findAll({ where: { userId: advance.userId } })).filter(l => {
        return l.type === JOB_NAME;
      });

      expect(log.successful).to.equal(true);
      expect(log.eventUuid).to.equal(`${advance.id}`);
    });
  });

  describe('advances', () => {
    it('includes advances belonging to bank account', async () => {
      sandbox.stub(Tabapay, 'retrieve').resolves({
        status: 'COMPLETED',
        id: 'foo-bar-1-' + moment().unix(),
      });

      const advance = await createAdvance();

      const bankAccountId = advance.bankAccountId;

      await collectAfterBankAccountUpdate({ bankAccountId, updatedAt: moment().format() });

      const collections = await AdvanceCollectionAttempt.scope('successful').findAll({
        attributes: ['advanceId'],
      });
      const collectedAdvanceIds = collections.map(c => c.advanceId);

      expect(collectedAdvanceIds).to.include(advance.id);
    });

    it('includes advances that are due today in the default timezone', async () => {
      sandbox.stub(Tabapay, 'retrieve').resolves({
        status: 'COMPLETED',
        id: 'foo-bar-2-' + moment().unix(),
      });

      const advance = await createAdvance({ paybackDate: moment().tz(DEFAULT_TIMEZONE) });

      const bankAccountId = advance.bankAccountId;

      await collectAfterBankAccountUpdate({ bankAccountId, updatedAt: moment().format() });

      const collections = await AdvanceCollectionAttempt.scope('successful').findAll({
        attributes: ['advanceId'],
      });
      const collectedAdvanceIds = collections.map(c => c.advanceId);

      expect(collectedAdvanceIds).to.include(advance.id);
    });

    it('excludes advances that are not due', async () => {
      const advance = await createAdvance({ paybackDate: moment().add(1, 'day') });

      const bankAccountId = advance.bankAccountId;

      await collectAfterBankAccountUpdate({ bankAccountId, updatedAt: moment().format() });

      const collections = await AdvanceCollectionAttempt.scope('successful').findAll({
        attributes: ['advanceId'],
      });
      const collectedAdvanceIds = collections.map(c => c.advanceId);

      expect(collectedAdvanceIds).to.not.include(advance.id);
    });

    it('excludes advances that are already paid off', async () => {
      const advance = await createAdvance();

      await advance.update({ outstanding: 0 });

      const bankAccountId = advance.bankAccountId;

      await collectAfterBankAccountUpdate({ bankAccountId, updatedAt: moment().format() });

      const collections = await AdvanceCollectionAttempt.scope('successful').findAll({
        attributes: ['advanceId'],
      });
      const collectedAdvanceIds = collections.map(c => c.advanceId);

      expect(collectedAdvanceIds).to.not.include(advance.id);
    });

    it('excludes advances already being collected', async () => {
      const advance = await createAdvance();
      await factory.create('advance-collection-attempt', { advanceId: advance.id, processing: 1 });

      const bankAccountId = advance.bankAccountId;

      await collectAfterBankAccountUpdate({ bankAccountId, updatedAt: moment().format() });

      const collections = await AdvanceCollectionAttempt.scope('successful').findAll({
        attributes: ['advanceId'],
      });
      const collectedAdvanceIds = collections.map(c => c.advanceId);

      expect(collectedAdvanceIds).to.not.include(advance.id);
    });
  });

  context('collect from backup bank account (Plaid advances)', () => {
    let advance: Advance;
    let toBankAccount: BankAccount;
    let fromBankAccount: BankAccount;
    let tabapayStub: any;

    beforeEach(async () => {
      const { id: userId } = await factory.create('user');
      const { id: bankConnectionId } = await factory.create('bank-connection', {
        userId,
        bankingDataSource: BankingDataSource.Plaid,
      });
      toBankAccount = await factory.create('checking-account', { userId, bankConnectionId });

      const toBankConnection = await toBankAccount.getBankConnection();
      await toBankConnection.update({ primaryBankAccountId: toBankAccount.id });

      advance = await factory.create('advance', {
        userId,
        bankAccountId: toBankAccount.id,
        paymentMethodId: null,
        amount: 75,
        fee: 0,
        paybackDate: moment().subtract(1, 'day'),
        delivery: AdvanceDelivery.Standard,
        outstanding: 75.75,
        disbursementStatus: 'COMPLETED',
      });

      const [oldBankConnection] = await Promise.all([
        factory.create('bank-connection', {
          userId: advance.userId,
          bankingDataSource: BankingDataSource.Plaid,
        }),
        factory.create('advance-tip', { advanceId: advance.id, amount: 0.75, percent: 1 }),
      ]);

      fromBankAccount = await factory.create('checking-account', {
        userId: advance.userId,
        bankConnectionId: oldBankConnection.id,
        available: 500,
        current: 500,
      });

      await oldBankConnection.update({ primaryBankAccountId: fromBankAccount.id });

      const { id: paymentMethodId } = await factory.create('payment-method', {
        userId,
        bankAccountId: fromBankAccount.id,
      });
      fromBankAccount.defaultPaymentMethodId = paymentMethodId;
      await fromBankAccount.save();

      tabapayStub = sandbox.stub(Tabapay, 'retrieve').resolves({
        status: 'COMPLETED',
        id: 'foo-bar-' + userId + moment().unix(),
      });
    });

    afterEach(() => sandbox.restore());

    it('should collect from the bank account payment method if it is a backup for an advance', async () => {
      await collectAfterBankAccountUpdate({
        bankAccountId: fromBankAccount.id,
        updatedAt: moment().format(),
      });

      const [updatedAdvance, [payment]] = await Bluebird.all([
        Advance.findByPk(advance.id),
        Payment.findAll({ where: { advanceId: advance.id } }),
      ]);

      expect(payment.amount).to.equal(75.75);
      expect(updatedAdvance.outstanding).to.equal(0);
      expect(payment.paymentMethodId).to.equal(fromBankAccount.defaultPaymentMethodId);
    });

    it('should collect via synapse if there is a backup bank account for an advance and it does not have a payment method', async () => {
      await fromBankAccount.update({ defaultPaymentMethodId: null });
      sandbox.stub(ACH, 'isInSameDayACHCollectionWindow').returns(true);

      sandbox.stub(SynapsepayNodeLib, 'charge').resolves({
        status: 'PENDING',
        id: 'foo-bar-' + moment().unix(),
      });

      await collectAfterBankAccountUpdate({
        bankAccountId: fromBankAccount.id,
        updatedAt: moment().format(),
      });

      const [updatedAdvance, [payment]] = await Bluebird.all([
        Advance.findByPk(advance.id),
        Payment.findAll({ where: { advanceId: advance.id } }),
      ]);

      expect(payment.amount).to.equal(75.75);
      expect(updatedAdvance.outstanding).to.equal(0);
      expect(payment.bankAccountId).to.equal(fromBankAccount.id);
    });

    it('should create an audit log on success', async () => {
      await collectAfterBankAccountUpdate({
        bankAccountId: fromBankAccount.id,
        updatedAt: moment().format(),
      });

      const auditLog = await AuditLog.findOne({
        where: {
          eventUuid: advance.id,
          type: 'COLLECT_AFTER_BANK_ACCOUNT_UPDATE',
        },
      });

      expect(auditLog.userId).to.equal(advance.userId);
      expect(auditLog.successful).to.equal(true);
    });

    it('should create an audit log on failure', async () => {
      await fromBankAccount.update({ available: 0, current: 0 });

      await collectAfterBankAccountUpdate({
        bankAccountId: fromBankAccount.id,
        updatedAt: moment().format(),
      });

      const auditLog = await AuditLog.findOne({
        where: {
          eventUuid: advance.id,
          type: 'COLLECT_AFTER_BANK_ACCOUNT_UPDATE',
        },
      });

      expect(auditLog.userId).to.equal(advance.userId);
      expect(auditLog.successful).to.equal(false);
      expect(auditLog.message).to.eq('Balance too low to attempt collection');
    });

    it('should not collect if there is a collection in progress', async () => {
      await AdvanceCollectionAttempt.create({
        advanceId: advance.id,
        trigger: 'bacon-time',
        processing: true,
        amount: 20,
      });

      await collectAfterBankAccountUpdate({
        bankAccountId: fromBankAccount.id,
        updatedAt: moment().format(),
      });

      expect(tabapayStub.callCount).to.eq(0);

      const auditLog = await AuditLog.findOne({
        where: {
          eventUuid: advance.id,
          type: 'COLLECT_AFTER_BANK_ACCOUNT_UPDATE',
        },
      });

      expect(auditLog).to.equal(null);
    });
  });
});

context('collect from backup bank account (Bank of Dave advances)', () => {
  let advance: Advance;
  let toBankAccount: BankAccount;
  let fromBankAccount: BankAccount;

  beforeEach(async () => {
    const { id: userId } = await factory.create('user');
    const { id: bankConnectionId } = await factory.create('bank-connection', {
      userId,
      bankingDataSource: BankingDataSource.BankOfDave,
    });
    toBankAccount = await factory.create('checking-account', { userId, bankConnectionId });

    const toBankConnection = await toBankAccount.getBankConnection();
    await toBankConnection.update({ primaryBankAccountId: toBankAccount.id });

    advance = await factory.create('advance', {
      userId,
      bankAccountId: toBankAccount.id,
      paymentMethodId: null,
      amount: 75,
      fee: 0,
      paybackDate: moment().subtract(1, 'day'),
      delivery: AdvanceDelivery.Standard,
      outstanding: 75.75,
      disbursementStatus: 'COMPLETED',
    });

    const [oldBankConnection] = await Promise.all([
      factory.create('bank-connection', {
        userId: advance.userId,
        bankingDataSource: BankingDataSource.Plaid,
      }),
      factory.create('advance-tip', { advanceId: advance.id, amount: 0.75, percent: 1 }),
    ]);

    fromBankAccount = await factory.create('checking-account', {
      userId: advance.userId,
      bankConnectionId: oldBankConnection.id,
      available: 500,
      current: 500,
    });

    await oldBankConnection.update({ primaryBankAccountId: fromBankAccount.id });

    const { id: paymentMethodId } = await factory.create('payment-method', {
      userId,
      bankAccountId: fromBankAccount.id,
    });
    fromBankAccount.defaultPaymentMethodId = paymentMethodId;
    await fromBankAccount.save();
  });

  it('should not collect from an alternate account', async () => {
    await collectAfterBankAccountUpdate({
      bankAccountId: fromBankAccount.id,
      updatedAt: moment().format(),
    });

    const [updatedAdvance, payments] = await Bluebird.all([
      Advance.findByPk(advance.id),
      Payment.findAll({ where: { advanceId: advance.id } }),
    ]);

    expect(payments).to.be.empty;
    expect(updatedAdvance.outstanding).to.equal(75.75);
  });
});

async function createAdvance({
  amount: amount = 75,
  fee: fee = 5,
  paybackDate: paybackDate = moment().subtract(4, 'days'),
  tipPercent: tipPercent = 0,
  delivery: delivery = AdvanceDelivery.Express,
} = {}): Promise<Advance> {
  const tip = amount * (tipPercent / 100);

  const paymentMethod = await factory.create<PaymentMethod>('payment-method');
  const advance = await factory.create<Advance>('advance', {
    bankAccountId: paymentMethod.bankAccountId,
    paymentMethodId: paymentMethod.id,
    userId: paymentMethod.userId,
    amount,
    fee,
    paybackDate,
    delivery,
    outstanding: amount + fee + tip,
    disbursementStatus: ExternalTransactionStatus.Completed,
  });

  const [bankAccount] = await Promise.all([
    advance.getBankAccount(),
    factory.create('advance-tip', { advanceId: advance.id, amount: tip, percent: tipPercent }),
  ]);
  const balance = advance.outstanding + 10;

  await Promise.all([
    bankAccount.update({ available: balance, current: balance, userId: advance.userId }),
    BankConnection.update(
      {
        primaryBankAccountId: bankAccount.id,
      },
      {
        where: { id: bankAccount.bankConnectionId },
      },
    ),
  ]);

  return advance;
}
