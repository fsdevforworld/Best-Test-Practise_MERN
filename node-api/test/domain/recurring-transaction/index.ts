import { expect } from 'chai';
import { identity } from 'lodash';
import * as sinon from 'sinon';
import { RecurringTransactionInterval } from '@dave-inc/wire-typings';
import factory from '../../factories';
import { clean } from '../../test-helpers';
import { TransactionType } from '../../../src/typings';
import * as Events from '../../../src/domain/recurring-transaction/events';
import * as Store from '../../../src/domain/recurring-transaction/store';
import * as Domain from '../../../src/domain/recurring-transaction';
import { ModificationSource } from '../../../src/domain/recurring-transaction';
import * as Create from '../../../src/domain/recurring-transaction/create-recurring-transaction';
import * as Detect from '../../../src/domain/recurring-transaction/detect-recurring-transaction';
import Notifications from '../../../src/domain/recurring-transaction/notifications';
import * as Forecast from '../../../src/domain/forecast';
import { moment } from '@dave-inc/time-lib';
import { AuditLog } from '../../../src/models';
import { InvalidParametersError } from '../../../src/lib/error';
import stubBankTransactionClient from '../../test-helpers/stub-bank-transaction-client';

describe('Recurring Transaction core', () => {
  const sandbox = sinon.createSandbox();
  after(() => clean(sandbox));

  describe('saveRecurringTransactions', () => {
    let insertStub: sinon.SinonStub;
    let publishStub: sinon.SinonStub;

    beforeEach(async () => {
      await clean(sandbox);

      insertStub = sandbox.stub(Store, 'insert').callsFake(identity);
      publishStub = sandbox.stub(Events, 'publishNewRecurringTransaction');
    });

    it('call store with provided rows to insert', async () => {
      const t0 = await factory.build('recurring-transaction', {
        id: 1000,
        type: TransactionType.INCOME,
      });
      const t1 = await factory.build('recurring-transaction', {
        id: 1001,
        type: TransactionType.EXPENSE,
      });

      const insertRows = [t0, t1].map(t => ({
        transaction: t,
        institutionId: 99,
      }));
      await Domain.saveRecurringTransactions(insertRows);

      sandbox.assert.calledTwice(insertStub);
      insertRows.forEach((newRT: Detect.NewRecurringTransaction, i: number) => {
        const [insertRow] = insertStub.getCall(i).args[0];
        expect(insertRow.id).to.equal(newRT.transaction.id);
      });
    });

    it('publish event for each saved recurring transaction', async () => {
      const t0 = await factory.build('recurring-transaction', {
        id: 1000,
        type: TransactionType.INCOME,
        transactionDisplayName: 'foo',
      });
      const t1 = await factory.build('recurring-transaction', {
        id: 1001,
        type: TransactionType.EXPENSE,
        transactionDisplayName: 'bar',
      });

      const insertRows = [t0, t1].map(t => ({
        transaction: t,
        institutionId: 102,
        minAmount: t.userAmount - 100,
      }));
      const inserted = await Domain.saveRecurringTransactions(insertRows);

      sandbox.assert.callCount(publishStub, insertRows.length);
      publishStub.args
        .map(callArgs => callArgs[0])
        .forEach((publishArg, i) => {
          const row = inserted[i];
          expect(publishArg.transaction).to.deep.equal(row);
          expect(publishArg.minAmount).to.equal(row.userAmount - 100);
          expect(publishArg.institutionId).to.equal(102);
        });
    });
  });

  describe('create RecurringTransactions', () => {
    let forecastStub: sinon.SinonStub;

    beforeEach(async () => {
      await clean(sandbox);
      sandbox.stub(Events, 'publishNewRecurringTransaction').resolves(null);
      forecastStub = sandbox.stub(Forecast, 'computeAccountForecast');
    });

    it('should create recurring transaction', async () => {
      const bankAccount = await factory.create('bank-account');
      const params = {
        interval: RecurringTransactionInterval.MONTHLY,
        params: [15],
        userAmount: -100,
        userDisplayName: 'buy a thing',
        bankAccountId: bankAccount.id,
        userId: bankAccount.userId,
        skipValidityCheck: true,
      };

      const result = await Domain.create(params);

      expect(result).to.exist;
      expect(result.userId).to.equal(bankAccount.userId);
      expect(result.bankAccountId).to.equal(bankAccount.id);
    });

    it('should validate Rsched parameters even with skipValidityCheck', async () => {
      const bankAccount = await factory.create('bank-account');
      const params = {
        interval: RecurringTransactionInterval.WEEKLY,
        params: ['not-a-weekday'],
        userAmount: 100,
        userDisplayName: 'bacon',
        bankAccountId: bankAccount.id,
        userId: bankAccount.userId,
        skipValidityCheck: true,
      };
      try {
        await Domain.create(params);
        expect(false);
      } catch (error) {
        expect(error).instanceOf(InvalidParametersError);
      }
    });

    it('should update forecasts after new recurring transaction', async () => {
      const bankAccount = await factory.create('bank-account');
      const params = {
        interval: RecurringTransactionInterval.MONTHLY,
        params: [15],
        userAmount: -100,
        userDisplayName: 'buy a thing',
        bankAccountId: bankAccount.id,
        userId: bankAccount.userId,
        skipValidityCheck: true,
      };
      await Domain.create(params);
      sandbox.assert.calledOnce(forecastStub);
      const [forecastArg] = forecastStub.firstCall.args;
      expect(forecastArg.id).to.equal(bankAccount.id);
    });

    it('should set main paycheck for first income', async () => {
      const bankAccount = await factory.create('bank-account', {
        mainPaycheckRecurringTransactionId: null,
      });
      const params = {
        interval: RecurringTransactionInterval.MONTHLY,
        params: [15],
        userAmount: 800,
        userDisplayName: 'make it rain',
        bankAccountId: bankAccount.id,
        userId: bankAccount.userId,
        skipValidityCheck: true,
      };

      const recurringTransaction = await Domain.create(params);

      await bankAccount.reload();
      expect(bankAccount.mainPaycheckRecurringTransactionId).to.equal(recurringTransaction.id);
    });

    it('should send notification for new income', async () => {
      const bankAccount = await factory.create('bank-account');
      const params = {
        interval: RecurringTransactionInterval.MONTHLY,
        params: [15],
        userAmount: 800,
        userDisplayName: 'dollah dollah bills',
        bankAccountId: bankAccount.id,
        userId: bankAccount.userId,
        skipValidityCheck: true,
      };

      const notifyStub = sandbox.stub(Notifications, 'notifyNewIncome');
      await Domain.create(params);
      sandbox.assert.calledOnce(notifyStub);
      const [recurringTransaction, source] = notifyStub.firstCall.args;

      expect(recurringTransaction.bankAccountId).to.equal(bankAccount.id);
      expect(recurringTransaction.userId).to.equal(bankAccount.userId);
      expect(source).to.equal(ModificationSource.API);
    });

    it('should send notification with admin source for admin create', async () => {
      const bankAccount = await factory.create('bank-account');
      const params = {
        interval: RecurringTransactionInterval.MONTHLY,
        params: [15],
        userAmount: 800,
        userDisplayName: 'dollah dollah bills',
        bankAccountId: bankAccount.id,
        userId: bankAccount.userId,
        skipValidityCheck: true,
      };

      const notifyStub = sandbox.stub(Notifications, 'notifyNewIncome');
      await Domain.adminCreate(bankAccount.userId, 99, params);

      sandbox.assert.calledOnce(notifyStub);
      const [recurringTransaction, source] = notifyStub.firstCall.args;

      expect(recurringTransaction.bankAccountId).to.equal(bankAccount.id);
      expect(recurringTransaction.userId).to.equal(bankAccount.userId);
      expect(source).to.equal(ModificationSource.Admin);
    });

    it('should audit log for admin create', async () => {
      const bankAccount = await factory.create('bank-account');
      const params = {
        interval: RecurringTransactionInterval.MONTHLY,
        params: [15],
        userAmount: 800,
        userDisplayName: 'dollah dollah bills',
        bankAccountId: bankAccount.id,
        userId: bankAccount.userId,
        skipValidityCheck: true,
      };

      const auditLogStub = sandbox.stub(AuditLog, 'create');
      const adminId = 99;
      await Domain.adminCreate(bankAccount.userId, adminId, params);

      sandbox.assert.calledOnce(auditLogStub);
      const [auditLogArgs] = auditLogStub.firstCall.args;

      expect(auditLogArgs.userId).to.equal(bankAccount.userId);
      expect(auditLogArgs.extra.admin).to.equal(adminId);
      expect(auditLogArgs.type).to.equal('RECURRING_TRANSACTION_CREATE');
    });
  });

  describe('saveBulkExpense', () => {
    let forecastStub: sinon.SinonStub;
    beforeEach(async () => {
      await clean(sandbox);
      forecastStub = sandbox.stub(Forecast, 'computeAccountForecast');
    });

    it('should bulk insert expenses', async () => {
      const bankAccount = await factory.create('bank-account');
      const baseParams = {
        interval: RecurringTransactionInterval.MONTHLY,
        params: [15],
        userAmount: -100,
        bankAccountId: bankAccount.id,
        userId: bankAccount.userId,
        skipValidityCheck: true,
      };
      const allParams = [
        Object.assign({}, baseParams, { userDisplayName: 'cookies' }),
        Object.assign({}, baseParams, { userDisplayName: 'milk' }),
        Object.assign({}, baseParams, { userDisplayName: 'cereal' }),
      ];

      const newExpenses = await Domain.saveBulkExpense(
        bankAccount.userId,
        bankAccount.id,
        allParams,
      );

      expect(newExpenses.length).to.equal(3);
      const names = newExpenses.map(exp => exp.userDisplayName);
      expect(names).to.include('cookies');
      expect(names).to.include('milk');
      expect(names).to.include('cereal');
    });

    it('should update forecasts after bulk adding expenses', async () => {
      const bankAccount = await factory.create('bank-account');
      const baseParams = {
        interval: RecurringTransactionInterval.MONTHLY,
        params: [15],
        userAmount: -100,
        bankAccountId: bankAccount.id,
        userId: bankAccount.userId,
        skipValidityCheck: true,
      };
      const allParams = [
        Object.assign({}, baseParams, { userDisplayName: 'cookies' }),
        Object.assign({}, baseParams, { userDisplayName: 'milk' }),
        Object.assign({}, baseParams, { userDisplayName: 'cereal' }),
      ];

      await Domain.saveBulkExpense(bankAccount.userId, bankAccount.id, allParams);
      sandbox.assert.calledOnce(forecastStub);
      const [forecastArg] = forecastStub.firstCall.args;
      expect(forecastArg.id).to.equal(bankAccount.id);
    });
  });

  describe('update', () => {
    let forecastStub: sinon.SinonStub;
    beforeEach(async () => {
      await clean(sandbox);
      stubBankTransactionClient(sandbox);
      forecastStub = sandbox.stub(Forecast, 'computeAccountForecastFromBankAccountId');
    });

    async function createRTBiweeklyFriday() {
      const rt = await factory.create('recurring-transaction', {
        userAmount: 500,
        transactionDisplayName: 'cash rules everything around me',
        type: TransactionType.INCOME,
        interval: RecurringTransactionInterval.BIWEEKLY,
        params: ['friday'],
      });
      const bt0 = await factory.create('bank-transaction', {
        userId: rt.userId,
        amount: 100,
        displayName: rt.transactionDisplayName,
        bankAccountId: rt.bankAccountId,
        transactionDate: moment().day(-2),
      });
      const bt1 = await factory.create('bank-transaction', {
        userId: rt.userId,
        amount: 100,
        displayName: rt.transactionDisplayName,
        bankAccountId: rt.bankAccountId,
        transactionDate: moment()
          .day(-2)
          .subtract(2, 'week'),
      });
      return {
        recurringTransaction: rt,
        bankTransactions: [bt0, bt1],
      };
    }

    it('should update recurring transaction', async () => {
      const { recurringTransaction: rt, bankTransactions } = await createRTBiweeklyFriday();
      const updateParams = {
        interval: RecurringTransactionInterval.SEMI_MONTHLY,
        params: bankTransactions.map(bt => moment(bt.transactionDate).date()),
      };

      const result = await Domain.update(rt.id, updateParams);
      expect(result.rsched.interval).to.equal(updateParams.interval);
      expect(result.rsched.params).to.equal(updateParams.params);
    });

    it('should not accept non-matching recurring schedules', async () => {
      const { recurringTransaction: rt } = await createRTBiweeklyFriday();
      const updateParams = {
        interval: RecurringTransactionInterval.WEEKLY,
        params: ['wednesday'],
      };

      try {
        await Domain.update(rt.id, updateParams);
        expect(false);
      } catch (error) {
        expect(error).instanceOf(InvalidParametersError);
      }
    });

    it('should accept any valid schedule with skipValidityCheck', async () => {
      const { recurringTransaction: rt } = await createRTBiweeklyFriday();
      const updateParams = {
        interval: RecurringTransactionInterval.WEEKLY,
        params: ['wednesday'],
        skipValidityCheck: true,
      };

      const result = await Domain.update(rt.id, updateParams);
      expect(result.rsched.interval).to.equal(updateParams.interval);
      expect(result.rsched.params).to.deep.equal(updateParams.params);
    });

    it('should accept any valid schedule with admin update', async () => {
      const { recurringTransaction: rt } = await createRTBiweeklyFriday();
      const updateParams = {
        interval: RecurringTransactionInterval.WEEKLY,
        params: ['wednesday'],
      };
      const adminId = 100;

      const result = await Domain.adminUpdate(rt.id, adminId, updateParams);
      expect(result.rsched.interval).to.equal(updateParams.interval);
      expect(result.rsched.params).to.deep.equal(updateParams.params);
    });

    it('should not accept an invalid schedule', async () => {
      const { recurringTransaction: rt } = await createRTBiweeklyFriday();
      const updateParams = {
        interval: RecurringTransactionInterval.WEEKLY,
        params: ['not a weekday'],
        skipValidityCheck: true,
      };

      try {
        await Domain.update(rt.id, updateParams);
        expect(false);
      } catch (error) {
        expect(error).instanceOf(InvalidParametersError);
      }
    });

    it('should not accept an invalid schedule as admin ', async () => {
      const { recurringTransaction: rt } = await createRTBiweeklyFriday();
      const updateParams = {
        interval: RecurringTransactionInterval.WEEKLY,
        params: ['not a weekday'],
        skipValidityCheck: true,
      };

      try {
        const adminId = 100;
        await Domain.adminUpdate(rt.id, adminId, updateParams);
        expect(false);
      } catch (error) {
        expect(error).instanceOf(InvalidParametersError);
      }
    });

    it('should update forecast', async () => {
      const { recurringTransaction: rt } = await createRTBiweeklyFriday();
      const updateParams = {
        interval: RecurringTransactionInterval.WEEKLY,
        params: ['wednesday'],
        skipValidityCheck: true,
      };

      await Domain.update(rt.id, updateParams);

      sandbox.assert.calledOnce(forecastStub);
      const [forecastArg] = forecastStub.firstCall.args;
      expect(forecastArg).to.equal(rt.bankAccountId);
    });

    it('should create audit log for update', async () => {
      const { recurringTransaction: rt } = await createRTBiweeklyFriday();
      const updateParams = {
        interval: RecurringTransactionInterval.WEEKLY,
        params: ['wednesday'],
        skipValidityCheck: true,
      };

      const auditLogSpy = sandbox.stub(AuditLog, 'create');
      await Domain.update(rt.id, updateParams);

      sandbox.assert.calledOnce(auditLogSpy);
      const [args] = auditLogSpy.firstCall.args;
      expect(args.userId).to.equal(rt.userId);
      expect(args.type).to.equal('USER_RECURRING_TRANSACTION_UPDATE');
      expect(args.extra.updated).to.deep.equal(updateParams);
    });

    it('should create audit log for admin update', async () => {
      const { recurringTransaction: rt } = await createRTBiweeklyFriday();
      const updateParams = {
        interval: RecurringTransactionInterval.WEEKLY,
        params: ['wednesday'],
        userAmount: rt.userAmount + 100,
        skipValidityCheck: true,
      };

      const auditLogSpy = sandbox.stub(AuditLog, 'create');
      const adminId = 100;
      await Domain.adminUpdate(rt.id, adminId, updateParams);

      sandbox.assert.calledOnce(auditLogSpy);
      const [args] = auditLogSpy.firstCall.args;
      expect(args.userId).to.equal(rt.userId);
      expect(args.type).to.equal('ADMIN_RECURRING_TRANSACTION_UPDATE');
      expect(args.extra.admin).to.equal(adminId);
      expect(args.extra.interval.newData).to.equal(updateParams.interval);
      expect(args.extra.interval.originalData).to.equal(rt.interval);
      expect(args.extra.params.newData).to.deep.equal(updateParams.params);
      expect(args.extra.params.originalData).to.deep.equal(rt.params);
      expect(args.extra.userAmount.newData).to.deep.equal(updateParams.userAmount);
      expect(args.extra.userAmount.originalData).to.deep.equal(rt.userAmount);
    });
  });

  describe('delete', () => {
    let forecastStub: sinon.SinonStub;
    beforeEach(async () => {
      await clean(sandbox);
      forecastStub = sandbox.stub(Forecast, 'computeAccountForecast');
    });

    it('should delete recurring transaction', async () => {
      const rt = await factory.create('recurring-transaction');
      const deleted = await Domain.deleteById(rt.id);
      expect(deleted.id).to.equal(rt.id);

      const found = await Store.getById(rt.id);
      expect(found).to.not.exist;
    });

    it('should delete recurring transaction as admin', async () => {
      const rt = await factory.create('recurring-transaction');
      const adminId = 100;
      await Domain.adminDelete(rt.id, adminId);

      const found = await Store.getById(rt.id);
      expect(found).to.not.exist;
    });

    it('should create audit log for admin delete', async () => {
      const rt = await factory.create('recurring-transaction');
      const adminId = 100;
      const auditLogSpy = sandbox.stub(AuditLog, 'create');

      await Domain.adminDelete(rt.id, adminId);

      sandbox.assert.calledOnce(auditLogSpy);
      const [args] = auditLogSpy.firstCall.args;
      expect(args.extra.admin).to.equal(adminId);
      expect(args.type).to.equal('RECURRING_TRANSACTION_DELETE');
      expect(args.extra.originalData.id).to.equal(rt.id);
      expect(args.extra.originalData.userDisplayName).to.equal(rt.userDisplayName);
      expect(args.extra.originalData.interval).to.equal(rt.interval);
      expect(args.extra.originalData.params).to.deep.equal(rt.params);
    });

    it('should unset bank account if main check', async () => {
      const bankAccount = await factory.create('bank-account');
      const rt = await factory.create('recurring-transaction', {
        bankAccountId: bankAccount.id,
        userId: bankAccount.userId,
      });
      await bankAccount.update({ mainPaycheckRecurringTransactionId: rt.id });

      await Domain.deleteById(rt.id);

      await bankAccount.reload();
      expect(bankAccount.mainPaycheckRecurringTransactionId).to.not.exist;
    });

    it('should update bank account main check if other incomes exist', async () => {
      const bankAccount = await factory.create('bank-account');
      const rt = await factory.create('recurring-transaction', {
        bankAccountId: bankAccount.id,
        userId: bankAccount.userId,
      });
      await bankAccount.update({ mainPaycheckRecurringTransactionId: rt.id });

      await factory.create('recurring-transaction', {
        bankAccountId: bankAccount.id,
        userId: bankAccount.userId,
        userAmount: 999,
      });
      const nextMainCheck = await factory.create('recurring-transaction', {
        bankAccountId: bankAccount.id,
        userId: bankAccount.userId,
        userAmount: 9999,
      });

      await Domain.deleteById(rt.id);

      await bankAccount.reload();
      expect(bankAccount.mainPaycheckRecurringTransactionId).to.equal(nextMainCheck.id);
    });

    it('should update forecase', async () => {
      const rt = await factory.create('recurring-transaction');
      const deleted = await Domain.deleteById(rt.id);
      expect(deleted.id).to.equal(rt.id);

      sandbox.assert.calledOnce(forecastStub);
      const [forecastArg] = forecastStub.firstCall.args;
      expect(forecastArg.id).to.equal(rt.bankAccountId);
    });
  });

  describe('detect recurring transactions', () => {
    let detectStub: sinon.SinonStub;
    beforeEach(async () => {
      await clean(sandbox);
      detectStub = sandbox.stub(Detect, 'detectRecurringTransactions').resolves({
        bankTransactionId: 1000,
        amount: 100,
        foundSchedule: false,
        displayName: 'lemonade stand',
        bankAccountId: 99,
      });
    });

    it('should call detect with income type to detect income', async () => {
      const bankAccountId = 99;
      await Domain.detectIncome(bankAccountId);

      sandbox.assert.calledOnce(detectStub);

      const [detectAccount, detectType] = detectStub.firstCall.args;
      expect(detectAccount).to.equal(bankAccountId);
      expect(detectType).to.equal(TransactionType.INCOME);
    });

    it('should get possible single transaction income if no detected income and eligible', async () => {
      const bankAccountId = 99;

      detectStub.resolves([]);
      const eligibilityCheck = sandbox
        .stub(Create, 'canCreateSingleTransactionPaychecks')
        .resolves(true);
      const singleTransactionIncome = sandbox.stub(
        Detect,
        'getSingleTransactionPossibleRecurringIncome',
      );

      await Domain.detectIncome(bankAccountId);

      sandbox.assert.calledOnce(eligibilityCheck);
      sandbox.assert.calledOnce(singleTransactionIncome);
    });

    it('should not get possible single transaction income if no detected income but  ineligible', async () => {
      const bankAccountId = 99;

      detectStub.resolves([]);
      const eligibilityCheck = sandbox
        .stub(Create, 'canCreateSingleTransactionPaychecks')
        .resolves(false);
      const singleTransactionIncome = sandbox.stub(
        Detect,
        'getSingleTransactionPossibleRecurringIncome',
      );

      await Domain.detectIncome(bankAccountId);

      sandbox.assert.calledOnce(eligibilityCheck);
      sandbox.assert.notCalled(singleTransactionIncome);
    });

    it('should call detect with expense type to detect expenses', async () => {
      const bankAccountId = 99;
      await Domain.detectExpenses(bankAccountId);

      sandbox.assert.calledOnce(detectStub);

      const [detectAccount, detectType] = detectStub.firstCall.args;
      expect(detectAccount).to.equal(bankAccountId);
      expect(detectType).to.equal(TransactionType.EXPENSE);
    });
  });
});
