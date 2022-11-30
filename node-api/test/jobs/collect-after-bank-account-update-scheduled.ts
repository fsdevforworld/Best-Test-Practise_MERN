import * as Bluebird from 'bluebird';
import * as sinon from 'sinon';
import factory from '../factories';
import { expect } from 'chai';
import { moment } from '@dave-inc/time-lib';
import * as Tabapay from '../../src/lib/tabapay';
import SynpasePayNodeLib from '../../src/domain/synapsepay/node';
import SynapsepayNodeLib from '../../src/domain/synapsepay/node';
import {
  Advance,
  AdvanceCollectionAttempt,
  AdvanceCollectionSchedule,
  AdvanceTip,
  AuditLog,
  BankConnection,
  Payment,
  PaymentMethod,
} from '../../src/models';
import { clean, stubLoomisClient } from '.././test-helpers';
import BankAccount from '../../src/models/bank-account';
import * as Collection from '../../src/domain/collection';
import * as ACH from '../../src/domain/collection/ach';

import {
  AdvanceDelivery,
  BankAccountSubtype,
  BankingDataSource,
  ExternalTransactionStatus,
} from '@dave-inc/wire-typings';
import { bankTransactionsDidUpdate } from '../../src/helper/bank-account';
import { BalanceLogCaller } from '../../src/typings';
import { collectAfterBankAccountUpdateScheduled } from '../../src/jobs/handlers/collect-after-bank-account-update';
import * as Jobs from '../../src/jobs/data';
import { MAX_JOB_AGE_MINS } from '../../src/jobs/handlers/collect-after-bank-account-update/helpers';
import { stubBalanceLogClient, stubBankTransactionClient } from '../test-helpers';

describe('Collect After Bank Account Update Scheduled', () => {
  const sandbox = sinon.createSandbox();

  const JOB_NAME = 'COLLECT_AFTER_BANK_ACCOUNT_UPDATE_SCHEDULED';

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

    it('is NOT called during the bankTransactionsDidUpdate event', async () => {
      stubBalanceLogClient(sandbox);
      sandbox.stub(Jobs, 'createCollectAfterBankAccountUpdateTask');

      const queueSpy = sandbox.stub(Jobs, 'createCollectAfterBankAccountUpdateScheduledTask');

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
          shouldCollect: true,
          caller: BalanceLogCaller.BankOfDaveTransactionsPubsubConsumer,
        }, //caller randomly chosen from among callers that actually call this in production
      );

      sinon.assert.notCalled(queueSpy);
      sinon.assert.calledOnce(createTaskStub);
      sinon.assert.calledWith(createTaskStub, { bankConnectionId: bankConnection.id });
    });
  });

  describe('collect after bank account update scheduled', () => {
    xit('does not collect if bank account is not supported', async () => {
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

      await collectAfterBankAccountUpdateScheduled({
        bankAccountId,
        updatedAt: moment()
          .subtract(MAX_JOB_AGE_MINS + 1, 'minutes')
          .format(),
      });

      sinon.assert.notCalled(collectSpy);
    });

    xit('does not collect if bank account is not supported', async () => {
      const advance = await createAdvance({
        amount: 75,
        fee: 5,
        tipPercent: 10,
      });

      await createActiveAdvanceCollectionScheduleWindow(advance.id);

      await BankAccount.update(
        { subtype: BankAccountSubtype.Savings },
        { where: { id: advance.bankAccountId } },
      );

      const bankAccountId = advance.bankAccountId;

      const collectSpy = sandbox.spy(Collection, 'collectAdvance');

      await collectAfterBankAccountUpdateScheduled({ bankAccountId, updatedAt: moment().format() });

      sinon.assert.notCalled(collectSpy);
    });

    xit('does not collect if bank account is not primary account', async () => {
      const advance = await createAdvance({
        amount: 75,
        fee: 5,
        tipPercent: 10,
      });

      await createActiveAdvanceCollectionScheduleWindow(advance.id);

      const bankAccount = await advance.getBankAccount();

      await BankConnection.update(
        { primaryBankAccountId: null },
        { where: { id: bankAccount.bankConnectionId } },
      );

      const bankAccountId = advance.bankAccountId;

      const collectSpy = sandbox.spy(Collection, 'collectAdvance');

      await collectAfterBankAccountUpdateScheduled({ bankAccountId, updatedAt: moment().format() });

      sinon.assert.notCalled(collectSpy);
    });

    xit('collects outstanding amount when available', async () => {
      const advance = await createAdvance({
        amount: 75,
        fee: 5,
        tipPercent: 10,
      });

      await createActiveAdvanceCollectionScheduleWindow(advance.id);

      const outstanding = advance.outstanding;

      sandbox.stub(Tabapay, 'retrieve').resolves({
        status: 'COMPLETED',
        id: 'foo-bar',
      });

      const bankAccountId = advance.bankAccountId;

      await collectAfterBankAccountUpdateScheduled({ bankAccountId, updatedAt: moment().format() });

      const [updatedAdvance, [payment]] = await Bluebird.all([
        Advance.findByPk(advance.id),
        Payment.findAll({ where: { advanceId: advance.id } }),
      ]);

      expect(updatedAdvance.outstanding).to.equal(0);
      expect(payment.amount).to.equal(outstanding);
    });

    xit('logs success', async () => {
      const advance = await createAdvance({
        amount: 75,
        fee: 5,
        tipPercent: 10,
      });

      await createActiveAdvanceCollectionScheduleWindow(advance.id);

      sandbox.stub(Tabapay, 'retrieve').resolves({
        status: 'COMPLETED',
        id: 'foo-bar',
      });

      const bankAccountId = advance.bankAccountId;

      await collectAfterBankAccountUpdateScheduled({ bankAccountId, updatedAt: moment().format() });

      const [log] = (await AuditLog.findAll({ where: { userId: advance.userId } })).filter(l => {
        return l.type === JOB_NAME;
      });

      expect(log.successful).to.equal(true);
      expect(log.eventUuid).to.equal(`${advance.id}`);
    });

    xit('logs failure', async () => {
      const advance = await createAdvance({
        amount: 75,
        fee: 5,
        tipPercent: 10,
      });

      await createActiveAdvanceCollectionScheduleWindow(advance.id);

      sandbox.stub(Tabapay, 'retrieve').rejects();
      sandbox.stub(SynpasePayNodeLib, 'charge').rejects();

      const bankAccountId = advance.bankAccountId;

      await collectAfterBankAccountUpdateScheduled({ bankAccountId, updatedAt: moment().format() });

      const [log] = (await AuditLog.findAll({ where: { userId: advance.userId } })).filter(l => {
        return l.type === JOB_NAME;
      });

      expect(log.successful).to.equal(true);
      expect(log.eventUuid).to.equal(`${advance.id}`);
    });
  });

  describe('advances', () => {
    xit('includes advances belonging to bank account', async () => {
      sandbox.stub(Tabapay, 'retrieve').resolves({
        status: 'COMPLETED',
        id: 'foo-bar',
      });

      const advance = await createAdvance();

      await createActiveAdvanceCollectionScheduleWindow(advance.id);

      const bankAccountId = advance.bankAccountId;

      await collectAfterBankAccountUpdateScheduled({ bankAccountId, updatedAt: moment().format() });

      const collections = await AdvanceCollectionAttempt.scope('successful').findAll({
        attributes: ['advanceId'],
      });
      const collectedAdvanceIds = collections.map(c => c.advanceId);

      expect(collectedAdvanceIds).to.include(advance.id);
    });

    xit('includes advances that have a scheduled collection window', async () => {
      sandbox.stub(Tabapay, 'retrieve').resolves({
        status: 'COMPLETED',
        id: 'foo-bar',
      });

      const advance = await createAdvance();

      await createActiveAdvanceCollectionScheduleWindow(advance.id);

      const bankAccountId = advance.bankAccountId;

      await collectAfterBankAccountUpdateScheduled({ bankAccountId, updatedAt: moment().format() });

      const collections = await AdvanceCollectionAttempt.scope('successful').findAll({
        attributes: ['advanceId'],
      });
      const collectedAdvanceIds = collections.map(c => c.advanceId);

      expect(collectedAdvanceIds).to.include(advance.id);
    });

    xit('includes advances that are "not due" but have a scheduled collection window', async () => {
      sandbox.stub(Tabapay, 'retrieve').resolves({
        status: 'COMPLETED',
        id: 'foo-bar',
      });

      const advance = await createAdvance({ paybackDate: moment().add(2, 'days') });

      await createActiveAdvanceCollectionScheduleWindow(advance.id);

      const bankAccountId = advance.bankAccountId;

      await collectAfterBankAccountUpdateScheduled({ bankAccountId, updatedAt: moment().format() });

      const collections = await AdvanceCollectionAttempt.scope('successful').findAll({
        attributes: ['advanceId'],
      });

      const collectedAdvanceIds = collections.map(c => c.advanceId);

      expect(collectedAdvanceIds).to.include(advance.id);
    });

    xit('excludes advances that are already paid off', async () => {
      const advance = await createAdvance();

      await createActiveAdvanceCollectionScheduleWindow(advance.id);

      await advance.update({ outstanding: 0 });

      const bankAccountId = advance.bankAccountId;

      await collectAfterBankAccountUpdateScheduled({ bankAccountId, updatedAt: moment().format() });

      const collections = await AdvanceCollectionAttempt.scope('successful').findAll({
        attributes: ['advanceId'],
      });
      const collectedAdvanceIds = collections.map(c => c.advanceId);

      expect(collectedAdvanceIds).to.not.include(advance.id);
    });

    xit('excludes advances already being collected', async () => {
      const advance = await createAdvance();

      await createActiveAdvanceCollectionScheduleWindow(advance.id);

      await factory.create('advance-collection-attempt', { advanceId: advance.id, processing: 1 });

      const bankAccountId = advance.bankAccountId;

      await collectAfterBankAccountUpdateScheduled({ bankAccountId, updatedAt: moment().format() });

      const collections = await AdvanceCollectionAttempt.scope('successful').findAll({
        attributes: ['advanceId'],
      });
      const collectedAdvanceIds = collections.map(c => c.advanceId);

      expect(collectedAdvanceIds).to.not.include(advance.id);
    });

    xit('should not collect if there is not a scheduled collection window', async () => {
      const advance = await createAdvance();

      const bankAccountId = advance.bankAccountId;

      await collectAfterBankAccountUpdateScheduled({ bankAccountId, updatedAt: moment().format() });

      const collections = await AdvanceCollectionAttempt.scope('successful').findAll({
        attributes: ['advanceId'],
      });
      const collectedAdvanceIds = collections.map(c => c.advanceId);

      expect(collectedAdvanceIds).to.not.include(advance.id);
    });

    xit('should not collect if the scheduled collection window is in the future', async () => {
      const advance = await createAdvance();

      await factory.create<AdvanceCollectionSchedule>('advance-collection-schedule', {
        advanceId: advance.id,
        windowStart: moment().add(7, 'days'),
      });

      const bankAccountId = advance.bankAccountId;

      await collectAfterBankAccountUpdateScheduled({ bankAccountId, updatedAt: moment().format() });

      const collections = await AdvanceCollectionAttempt.scope('successful').findAll({
        attributes: ['advanceId'],
      });
      const collectedAdvanceIds = collections.map(c => c.advanceId);

      expect(collectedAdvanceIds).to.not.include(advance.id);
    });
  });

  context('collect from backup bank account', () => {
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
        paybackDate: moment().add(1, 'day'),
        delivery: AdvanceDelivery.Standard,
        outstanding: 75.75,
        disbursementStatus: 'COMPLETED',
      });

      await factory.create('advance-tip', { advanceId: advance.id, amount: 0.75, percent: 1 });

      await createActiveAdvanceCollectionScheduleWindow(advance.id);

      const oldBankConnection = await factory.create('bank-connection', {
        userId: advance.userId,
        bankingDataSource: BankingDataSource.Plaid,
      });

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
        id: 'foo-bar',
      });
    });

    afterEach(() => sandbox.restore());

    xit('should collect from the bank account payment method if it is a backup for an advance', async () => {
      await collectAfterBankAccountUpdateScheduled({
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

    xit('should collect via synapse if there is a backup bank account for an advance and it does not have a payment method', async () => {
      await fromBankAccount.update({ defaultPaymentMethodId: null });
      sandbox.stub(ACH, 'isInSameDayACHCollectionWindow').returns(true);

      sandbox.stub(SynapsepayNodeLib, 'charge').resolves({
        status: 'PENDING',
        id: 'foo-bar',
      });

      await collectAfterBankAccountUpdateScheduled({
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

    xit('should create an audit log on success', async () => {
      await collectAfterBankAccountUpdateScheduled({
        bankAccountId: fromBankAccount.id,
        updatedAt: moment().format(),
      });

      const auditLog = await AuditLog.findOne({
        where: {
          eventUuid: advance.id,
          type: 'COLLECT_AFTER_BANK_ACCOUNT_UPDATE_SCHEDULED',
        },
      });

      expect(auditLog.userId).to.equal(advance.userId);
      expect(auditLog.successful).to.equal(true);
    });

    xit('should create an audit log on failure', async () => {
      await fromBankAccount.update({ available: 0, current: 0 });

      await collectAfterBankAccountUpdateScheduled({
        bankAccountId: fromBankAccount.id,
        updatedAt: moment().format(),
      });

      const auditLog = await AuditLog.findOne({
        where: {
          eventUuid: advance.id,
          type: 'COLLECT_AFTER_BANK_ACCOUNT_UPDATE_SCHEDULED',
        },
      });

      expect(auditLog.userId).to.equal(advance.userId);
      expect(auditLog.successful).to.equal(false);
      expect(auditLog.message).to.eq('Balance too low to attempt collection');
    });

    xit('should not collect if there is a collection in progress', async () => {
      await AdvanceCollectionAttempt.create({
        advanceId: advance.id,
        trigger: 'bacon-time',
        processing: true,
        amount: 20,
      });

      await collectAfterBankAccountUpdateScheduled({
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
    await collectAfterBankAccountUpdateScheduled({
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
  paybackDate: paybackDate = moment().add(1, 'days'),
  tipPercent: tipPercent = 0,
  delivery: delivery = AdvanceDelivery.Express,
} = {}): Promise<Advance> {
  const tip = amount * (tipPercent / 100);

  const paymentMethod = await factory.create<PaymentMethod>('payment-method');
  const advance = await factory.create<Advance>('advance', {
    bankAccountId: paymentMethod.bankAccountId,
    paymentMethodId: paymentMethod.id,
    amount,
    fee,
    paybackDate,
    delivery,
    outstanding: amount + fee + tip,
    disbursementStatus: ExternalTransactionStatus.Completed,
  });
  const [bankAccount] = await Promise.all([
    advance.getBankAccount(),
    factory.create<AdvanceTip>('advance-tip', {
      amount: tip,
      percent: tipPercent,
    }),
  ]);

  const balance = advance.outstanding + 10;

  await Promise.all([
    bankAccount.update({ available: balance, current: balance }),
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

async function createActiveAdvanceCollectionScheduleWindow(
  advanceId: number,
  { windowStart = moment().subtract(1, 'days'), windowEnd = moment() } = {},
): Promise<AdvanceCollectionSchedule> {
  return AdvanceCollectionSchedule.create({
    advanceId,
    windowStart,
    windowEnd,
  });
}
