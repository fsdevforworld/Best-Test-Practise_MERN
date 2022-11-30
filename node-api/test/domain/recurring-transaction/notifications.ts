import { expect } from 'chai';
import { fn as momentProto } from 'moment';
import * as sinon from 'sinon';

import factory from '../../factories';
import { clean } from '../../test-helpers';
import braze from '../../../src/lib/braze';
import { moment } from '@dave-inc/time-lib';
import { AnalyticsEvent, RecurringTransactionStatus, TransactionType } from '../../../src/typings';

import * as NotificationsDomain from '../../../src/domain/notifications';
import RTNotifications from '../../../src/domain/recurring-transaction/notifications';
import {
  AnalyticsLocation,
  ModificationSource,
} from '../../../src/domain/recurring-transaction/types';
import * as Utils from '../../../src/domain/recurring-transaction/utils';
import { RecurringTransactionInterval } from '@dave-inc/wire-typings';

describe('Notifications', () => {
  const sandbox = sinon.createSandbox();

  beforeEach(() => clean(sandbox));
  after(() => clean(sandbox));

  describe('sendTransactionMissed', () => {
    it('should send an alert and update user attributes in Braze', async () => {
      const recurringTransaction = await factory.create('recurring-transaction', {
        missed: moment(),
        userAmount: 300,
      });
      const brazeTrackStub = sandbox.stub(braze, 'track').resolves(null);
      const momentTestValue = '2020-01-01T00:00:00.000Z';
      sandbox.stub(momentProto, 'toISOString').returns(momentTestValue);

      await RTNotifications.sendTransactionMissed(recurringTransaction);

      sinon.assert.calledOnce(brazeTrackStub);
      sinon.assert.calledWith(brazeTrackStub, {
        attributes: [
          {
            missed_income_on: recurringTransaction.missed,
            externalId: recurringTransaction.userId.toString(),
            hasRecurringIncome: false,
            lastIncomeUpdated: momentTestValue,
          },
        ],
        events: [
          {
            externalId: recurringTransaction.userId.toString(),
            name: 'recurring income missed',
            time: recurringTransaction.missed,
            properties: {
              amount: recurringTransaction.userAmount,
            },
          },
        ],
      });
    });

    it('should NOT send an alert for missed expenses', async () => {
      const recurringTransaction = await factory.create('recurring-transaction', {
        missed: moment(),
        userAmount: -300,
      });
      const brazeTrackStub = sandbox.stub(braze, 'track');

      await RTNotifications.sendTransactionMissed(recurringTransaction);

      sinon.assert.notCalled(brazeTrackStub);
    });

    it('should swallow errors to notifications', async () => {
      const recurringTransaction = await factory.create('recurring-transaction', {
        missed: moment(),
        userAmount: 300,
      });
      sandbox.stub(braze, 'track').rejects();

      const sendMissed = RTNotifications.sendTransactionMissed(recurringTransaction);
      expect(sendMissed).to.be.fulfilled;
    });
  });

  describe('notifyExpensePredicted', () => {
    it('Should fire RecurringExpensePredicted event for user.', async () => {
      // setup
      const testUserId = 12345;
      const testCount = 99;
      const testAddedBy = ModificationSource.API;
      const testLocation: AnalyticsLocation = 'auto add';
      const notifyStub = sandbox
        .stub(NotificationsDomain, 'createMarketingEventsForUser')
        .returns(Promise.resolve());

      // code under test
      await RTNotifications.notifyExpensesPredicted(
        testUserId,
        testCount,
        testAddedBy,
        testLocation,
      );

      // verify
      sandbox.assert.calledOnce(notifyStub);
      const [userId, event, payload] = notifyStub.firstCall.args;
      expect(userId).to.equal(testUserId.toString());
      expect(event).to.equal(AnalyticsEvent.RecurringExpensesPredicted);
      expect(payload.count).to.equal(testCount);
      expect(payload.addedBy).to.equal(testAddedBy);
      expect(payload.location).to.equal(testLocation);
    });
  });

  describe('notifyAddExpense', () => {
    it('Should fire RecurringExpenseAdded event when predicted expense is added.', async () => {
      // setup
      const testRecurringTrxn = await factory.create('recurring-transaction', {
        userAmount: -10,
        type: TransactionType.EXPENSE,
        transactionDisplayName: 'Test Trxn Expense',
        userDisplayName: 'Test User Expense',
        interval: RecurringTransactionInterval.MONTHLY,
        params: [1],
      });
      const notifyStub = sandbox
        .stub(NotificationsDomain, 'createMarketingEventsForUser')
        .returns(Promise.resolve());

      // code under test
      await RTNotifications.notifyAddExpense(
        testRecurringTrxn,
        ModificationSource.Admin,
        'auto add',
        true,
      );

      // verify
      sandbox.assert.calledOnce(notifyStub);
      const [userId, event, payload] = notifyStub.firstCall.args;
      expect(userId).to.equal(testRecurringTrxn.userId.toString());
      expect(event).to.equal(AnalyticsEvent.RecurringExpenseAdded);
      expect(payload.amount).to.equal(-10);
      expect(payload.transactionDisplayName).to.equal('Test Trxn Expense');
      expect(payload.displayName).to.equal('Test User Expense');
      expect(payload.interval).to.equal(RecurringTransactionInterval.MONTHLY);
      expect(payload.params).to.equal(JSON.stringify([1]));
      expect(payload.addedBy).to.equal(ModificationSource.Admin);
      expect(payload.location).to.equal('auto add');
      expect(payload.predicted).to.equal(true);
    });

    it('Should fire RecurringExpenseAdded event when non-predicted expense is added.', async () => {
      // setup
      const testRecurringTrxn = await factory.create('recurring-transaction', {
        userAmount: -42,
        type: TransactionType.EXPENSE,
        transactionDisplayName: 'Test Trxn Expense',
        userDisplayName: 'Test User Expense',
        interval: RecurringTransactionInterval.BIWEEKLY,
        params: ['monday'],
      });
      const notifyStub = sandbox
        .stub(NotificationsDomain, 'createMarketingEventsForUser')
        .returns(Promise.resolve());

      // code under test
      await RTNotifications.notifyAddExpense(
        testRecurringTrxn,
        ModificationSource.System,
        'auto add',
        false,
      );

      // verify
      sandbox.assert.calledOnce(notifyStub);
      const [userId, event, payload] = notifyStub.firstCall.args;
      expect(userId).to.equal(testRecurringTrxn.userId.toString());
      expect(event).to.equal(AnalyticsEvent.RecurringExpenseAdded);
      expect(payload.amount).to.equal(-42);
      expect(payload.transactionDisplayName).to.equal('Test Trxn Expense');
      expect(payload.displayName).to.equal('Test User Expense');
      expect(payload.interval).to.equal(RecurringTransactionInterval.BIWEEKLY);
      expect(payload.params).to.equal(JSON.stringify(['monday']));
      expect(payload.addedBy).to.equal(ModificationSource.System);
      expect(payload.location).to.equal('auto add');
      expect(payload.predicted).to.equal(false);
    });

    it('Should Default to Predicted RecurringExpenseAdded event when none is provided.', async () => {
      // setup
      const testRecurringTrxn = await factory.create('recurring-transaction', {
        userAmount: -1,
        type: TransactionType.EXPENSE,
        transactionDisplayName: 'Test Trxn Expense',
        userDisplayName: 'Test User Expense',
        interval: RecurringTransactionInterval.WEEKLY,
        params: ['wednesday'],
      });
      const notifyStub = sandbox
        .stub(NotificationsDomain, 'createMarketingEventsForUser')
        .returns(Promise.resolve());

      // code under test
      await RTNotifications.notifyAddExpense(testRecurringTrxn, ModificationSource.API, 'auto add');

      // verify
      sandbox.assert.calledOnce(notifyStub);
      const [userId, event, payload] = notifyStub.firstCall.args;
      expect(userId).to.equal(testRecurringTrxn.userId.toString());
      expect(event).to.equal(AnalyticsEvent.RecurringExpenseAdded);
      expect(payload.amount).to.equal(-1);
      expect(payload.transactionDisplayName).to.equal('Test Trxn Expense');
      expect(payload.displayName).to.equal('Test User Expense');
      expect(payload.interval).to.equal(RecurringTransactionInterval.WEEKLY);
      expect(payload.params).to.equal(JSON.stringify(['wednesday']));
      expect(payload.addedBy).to.equal(ModificationSource.API);
      expect(payload.location).to.equal('auto add');
      expect(payload.predicted).to.equal(true);
    });

    it('Should not notify RecurringExpenseAdded for incomes.', async () => {
      //setup
      const recurringTransaction = await factory.create('recurring-transaction', {
        userAmount: 1,
        type: TransactionType.INCOME,
      });
      const notifyStub = sandbox
        .stub(NotificationsDomain, 'createMarketingEventsForUser')
        .returns(Promise.resolve());

      // code under test
      await RTNotifications.notifyAddExpense(
        recurringTransaction,
        ModificationSource.Admin,
        'auto add',
      );

      // verify
      sandbox.assert.notCalled(notifyStub);
    });
  });

  describe('notifyNewIncome', () => {
    it('should create notification for new Income', async () => {
      const recurringTransaction = await factory.create('recurring-transaction', {
        userAmount: 100,
        type: TransactionType.INCOME,
        status: RecurringTransactionStatus.VALID,
      });
      const bankAccount = await Utils.getBankAccount(recurringTransaction);
      const institution = await bankAccount.getInstitution();

      const notifyEventStub = sandbox
        .stub(NotificationsDomain, 'createMarketingEventsForUser')
        .returns(Promise.resolve());

      const notifyuserAttributeStub = sandbox
        .stub(NotificationsDomain, 'createMarketingAttributesForUser')
        .returns(Promise.resolve());

      await RTNotifications.notifyNewIncome(recurringTransaction, ModificationSource.Admin);

      sandbox.assert.calledOnce(notifyEventStub);
      const [userId, event, payload] = notifyEventStub.firstCall.args;
      expect(userId).to.equal(recurringTransaction.userId.toString());
      expect(event).to.equal(AnalyticsEvent.RecurringIncomeAdded);
      expect(payload.institutionName).to.equal(institution.displayName);
      expect(payload.amount).to.equal(recurringTransaction.userAmount);
      expect(payload.addedBy).to.equal(ModificationSource.Admin);

      sandbox.assert.calledOnce(notifyuserAttributeStub);
      const [userId1, userAttribute] = notifyuserAttributeStub.firstCall.args;
      expect(userId1).to.equal(recurringTransaction.userId.toString());
      expect(userAttribute.hasRecurringIncome).to.equal(true);
      expect(payload.addedBy).to.equal(ModificationSource.Admin);
    });

    it('should not notify for expense', async () => {
      const recurringTransaction = await factory.create('recurring-transaction', {
        userAmount: -100,
        type: TransactionType.EXPENSE,
      });

      const notifyEventStub = sandbox
        .stub(NotificationsDomain, 'createMarketingEventsForUser')
        .returns(Promise.resolve());

      const notifyuserAttributeStub = sandbox
        .stub(NotificationsDomain, 'createMarketingAttributesForUser')
        .returns(Promise.resolve());

      await RTNotifications.notifyNewIncome(recurringTransaction, ModificationSource.Admin);

      sandbox.assert.notCalled(notifyEventStub);
      sandbox.assert.notCalled(notifyuserAttributeStub);
    });
  });

  describe('notifyIncomeStatusChange', () => {
    it('should create notification for Income status change', async () => {
      const recurringTransaction = await factory.create('recurring-transaction', {
        userAmount: 100,
        type: TransactionType.INCOME,
      });

      const notifyEventStub = sandbox
        .stub(NotificationsDomain, 'createMarketingEventsForUser')
        .returns(Promise.resolve());

      const notifyuserAttributeStub = sandbox
        .stub(NotificationsDomain, 'createMarketingAttributesForUser')
        .returns(Promise.resolve());

      await RTNotifications.notifyIncomeStatusChange(
        recurringTransaction,
        RecurringTransactionStatus.VALID,
        RecurringTransactionStatus.MISSED,
      );

      sandbox.assert.calledOnce(notifyEventStub);
      sandbox.assert.calledOnce(notifyuserAttributeStub);
    });

    it('should not notify for expense', async () => {
      const recurringTransaction = await factory.create('recurring-transaction', {
        userAmount: -100,
        type: TransactionType.EXPENSE,
      });

      const notifyEventStub = sandbox
        .stub(NotificationsDomain, 'createMarketingEventsForUser')
        .returns(Promise.resolve());

      const notifyuserAttributeStub = sandbox
        .stub(NotificationsDomain, 'createMarketingAttributesForUser')
        .returns(Promise.resolve());

      await RTNotifications.notifyIncomeStatusChange(
        recurringTransaction,
        RecurringTransactionStatus.VALID,
        RecurringTransactionStatus.MISSED,
      );

      sandbox.assert.notCalled(notifyEventStub);
      sandbox.assert.notCalled(notifyuserAttributeStub);
    });

    it('should not notify if no status change', async () => {
      const recurringTransaction = await factory.create('recurring-transaction', {
        userAmount: 100,
        type: TransactionType.INCOME,
      });

      const notifyEventStub = sandbox
        .stub(NotificationsDomain, 'createMarketingEventsForUser')
        .returns(Promise.resolve());

      const notifyuserAttributeStub = sandbox
        .stub(NotificationsDomain, 'createMarketingAttributesForUser')
        .returns(Promise.resolve());

      await RTNotifications.notifyIncomeStatusChange(
        recurringTransaction,
        RecurringTransactionStatus.VALID,
        RecurringTransactionStatus.VALID,
      );

      sandbox.assert.notCalled(notifyEventStub);
      sandbox.assert.notCalled(notifyuserAttributeStub);
    });
  });
});
