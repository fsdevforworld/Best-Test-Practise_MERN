import * as sinon from 'sinon';
import { expect } from 'chai';
import 'mocha';
import IncomeTimingNode, {
  MAX_DAYS_UNTIL_PAYCHECK,
} from '../../../../../src/services/advance-approval/advance-approval-engine/nodes/existing-income-timing-node';
import factory from '../../../../factories';
import RecurringTransactionClient, {
  RecurringTransaction,
} from '../../../../../src/services/advance-approval/recurring-transaction-client';
import { DEFAULT_TIMEZONE, moment } from '@dave-inc/time-lib';
import { clean, fakeDateTime } from '../../../../test-helpers';
import { serializeApprovalResponse } from '../../../../../src/services/advance-approval/advance-approval-engine';
import { AdvanceApprovalResult } from '../../../../../src/services/advance-approval/types';
import stubBankTransactionClient from '../../../../test-helpers/stub-bank-transaction-client';

describe('IncomeTimingNode', () => {
  const sandbox = sinon.createSandbox();
  const existingIncomeTimingNode = new IncomeTimingNode();
  let approvalDict: any;

  beforeEach(async () => {
    stubBankTransactionClient(sandbox);
    const bankAccount = await factory.create('bank-account');
    const expectedPaycheck = { expectedDate: moment() };
    approvalDict = {
      bankAccount,
      expectedPaycheck,
      previousPaychecks: [],
      recurringIncome: null,
      incomeOverride: {},
      logExtra: {},
      today: moment(),
      userTimezone: DEFAULT_TIMEZONE,
    };
  });

  afterEach(() => clean(sandbox));

  context('failing cannotBePaidToday case', () => {
    let recurringTransaction: RecurringTransaction;

    beforeEach(async () => {
      recurringTransaction = await factory.create('recurring-transaction');
      const now = moment('2020-01-15T08:00:00Z'); //midnight user's time
      fakeDateTime(sandbox, now);
    });

    it('should fail if the next predicted expectedPaycheck is today', async () => {
      approvalDict.expectedPaycheck = { expectedDate: moment().startOf('day') };
      approvalDict.today = moment();
      approvalDict.recurringIncome = recurringTransaction;
      approvalDict.incomeOverride = null;
      sandbox.stub(RecurringTransactionClient, 'getNextExpectedTransaction').resolves({
        expectedDate: moment()
          .add(17, 'days')
          .ymd(),
      });
      const events = serializeApprovalResponse(
        await existingIncomeTimingNode.evaluate(approvalDict, {
          caseResolutionStatus: {},
        } as AdvanceApprovalResult),
        approvalDict,
      );
      expect(events.primaryRejectionReason).to.be.an('object');
      expect(events.primaryRejectionReason.type).to.equal('payday-today');
      expect(events.primaryRejectionReason.extra.interpolations.remainingDays).to.equal(3);
    });

    it('should fail if the next predicted expectedPaycheck is today and no recurring income exists', async () => {
      const today = moment();
      approvalDict.expectedPaycheck = { expectedDate: today };
      approvalDict.today = today;
      approvalDict.incomeOverride = null;
      const events = serializeApprovalResponse(
        await existingIncomeTimingNode.evaluate(approvalDict, {
          caseResolutionStatus: {},
        } as AdvanceApprovalResult),
        approvalDict,
      );
      expect(events.primaryRejectionReason).to.be.an('object');
      expect(events.primaryRejectionReason.type).to.equal('payday-today');
      expect(events.primaryRejectionReason.extra.interpolations.remainingDays).to.be.undefined;
    });

    it('should fail if the next income override is today', async () => {
      const today = moment();
      approvalDict.expectedPaycheck = null;
      approvalDict.today = today;
      approvalDict.recurringIncome = recurringTransaction;
      approvalDict.incomeOverride = { payDate: today };
      sandbox.stub(RecurringTransactionClient, 'getNextExpectedTransaction').resolves({
        expectedDate: moment()
          .add(17, 'days')
          .ymd(),
      });
      const events = serializeApprovalResponse(
        await existingIncomeTimingNode.evaluate(approvalDict, {
          caseResolutionStatus: {},
        } as AdvanceApprovalResult),
        approvalDict,
      );
      expect(events.primaryRejectionReason).to.be.an('object');
      expect(events.primaryRejectionReason.type).to.equal('payday-today');
      expect(events.primaryRejectionReason.extra.interpolations.remainingDays).to.equal(3);
    });

    it('should fail if the next income override is today and has no recurring income', async () => {
      const today = moment();
      approvalDict.expectedPaycheck = null;
      approvalDict.today = today;
      approvalDict.incomeOverride = { payDate: today };
      const events = serializeApprovalResponse(
        await existingIncomeTimingNode.evaluate(approvalDict, {
          caseResolutionStatus: {},
        } as AdvanceApprovalResult),
        approvalDict,
      );
      expect(events.primaryRejectionReason).to.be.an('object');
      expect(events.primaryRejectionReason.type).to.equal('payday-today');
      expect(events.primaryRejectionReason.extra.interpolations.remainingDays).to.be.undefined;
    });
  });

  context('failing daysUntilNextPaycheck case', () => {
    it(`should fail if the next predicted expectedPaycheck is more than ${MAX_DAYS_UNTIL_PAYCHECK} days out and return the same number of remaining days regardless of time`, async () => {
      const todayAt12AMInUserTime = moment('2020-10-11T07:00:00Z'); // Oct 11 at 12:00 AM in DEFAULT_TIMEZONE
      const todayBefore5PMInUserTime = moment('2020-10-11T23:59:00Z'); // Oct 11 at 4:59 PM in DEFAULT_TIMEZONE
      const todayAt5PMInUserTime = moment('2020-10-12T00:00:00Z'); // Oct 11 at 5:00 PM in DEFAULT_TIMEZONE
      const todayBeforeMidnightInUserTime = moment('2020-10-12T06:59:00Z'); // Oct 11 at 11:59 PM in DEFAULT_TIMEZONE
      const expectedDate = moment('2020-10-26T00:00:00Z');
      approvalDict.expectedPaycheck = { expectedDate };
      approvalDict.incomeOverride = null;
      approvalDict.recurringIncome = { skipValidityCheck: false, missed: null };
      const allPromises = [
        todayAt12AMInUserTime,
        todayBefore5PMInUserTime,
        todayAt5PMInUserTime,
        todayBeforeMidnightInUserTime,
      ].map(async today => {
        approvalDict.today = today.clone();
        const events = serializeApprovalResponse(
          await existingIncomeTimingNode.evaluate(approvalDict, {
            caseResolutionStatus: {},
          } as AdvanceApprovalResult),
          approvalDict,
        );
        expect(events.primaryRejectionReason).to.be.an('object');
        expect(events.primaryRejectionReason.type).to.equal('predicted-upcoming-income');
        expect(events.primaryRejectionReason.extra.interpolations.remainingDays).to.equal(1);
      });
      await Promise.all(allPromises);
    });

    it(`should fail if the next income override is more than ${MAX_DAYS_UNTIL_PAYCHECK} days out`, async () => {
      const todayAt12AMInUserTime = moment('2020-02-01T08:00:00Z'); // Feb 1 at 12:00 AM in DEFAULT_TIMEZONE
      const todayBefore4PMInUserTime = moment('2020-02-01T23:59:00Z'); // Feb 1 at 3:59 PM in DEFAULT_TIMEZONE
      const todayAt4PMInUserTime = moment('2020-02-02T00:00:00Z'); // Feb 1 at 4:00 PM in DEFAULT_TIMEZONE
      const todayBeforeMidnightInUserTime = moment('2020-02-02T07:59:00Z'); // Feb 1 at 11:59 PM in DEFAULT_TIMEZONE
      const expectedDate = moment('2020-02-17T00:00:00Z');
      approvalDict.expectedPaycheck = null;
      approvalDict.incomeOverride = { payDate: expectedDate };
      approvalDict.recurringIncome = { skipValidityCheck: false, missed: null };
      const allPromises = [
        todayAt12AMInUserTime,
        todayBefore4PMInUserTime,
        todayAt4PMInUserTime,
        todayBeforeMidnightInUserTime,
      ].map(async today => {
        approvalDict.today = today.clone();
        const events = serializeApprovalResponse(
          await existingIncomeTimingNode.evaluate(approvalDict, {
            caseResolutionStatus: {},
          } as AdvanceApprovalResult),
          approvalDict,
        );
        expect(events.primaryRejectionReason).to.be.an('object');
        expect(events.primaryRejectionReason.type).to.equal('predicted-upcoming-income');
        expect(events.primaryRejectionReason.extra.interpolations.remainingDays).to.equal(2);
      });
      await Promise.all(allPromises);
    });
  });

  context('pass all cases', () => {
    it(`should pass if the next predicted expectedPaycheck is ${MAX_DAYS_UNTIL_PAYCHECK} days out`, async () => {
      const today = moment('2020-02-03T08:00:00Z'); // Feb 3 at 12:00 AM in DEFAULT_TIMEZONE
      const expectedDate = moment('2020-02-14T00:00:00Z');
      approvalDict.today = today.clone();
      approvalDict.expectedPaycheck = { expectedDate };
      approvalDict.incomeOverride = null;
      approvalDict.recurringIncome = { skipValidityCheck: false, missed: null };
      const { primaryRejectionReason } = serializeApprovalResponse(
        await existingIncomeTimingNode.evaluate(approvalDict, {
          caseResolutionStatus: {},
        } as AdvanceApprovalResult),
        approvalDict,
      );
      expect(primaryRejectionReason).to.be.undefined;
    });

    it(`should pass if the next predicted expectedPaycheck is less than ${MAX_DAYS_UNTIL_PAYCHECK} days out`, async () => {
      const today = moment('2020-02-04T08:00:00Z'); // Feb 4 at 12:00 AM in DEFAULT_TIMEZONE
      const expectedDate = moment('2020-02-14T00:00:00Z');
      approvalDict.today = today.clone();
      approvalDict.expectedPaycheck = { expectedDate };
      approvalDict.incomeOverride = null;
      approvalDict.recurringIncome = { skipValidityCheck: false, missed: null };
      const { primaryRejectionReason } = serializeApprovalResponse(
        await existingIncomeTimingNode.evaluate(approvalDict, {
          caseResolutionStatus: {},
        } as AdvanceApprovalResult),
        approvalDict,
      );
      expect(primaryRejectionReason).to.be.undefined;
    });

    it('should pass if the next predicted expectedPaycheck is today in UTC but tomorrow in user timezone', async () => {
      const today = moment().startOf('day'); // midnight UTC = 4/5 PM in DEFAULT_TIMEZONE
      const expectedDate = today.clone();
      approvalDict.today = today.clone();
      approvalDict.expectedPaycheck = { expectedDate };
      approvalDict.incomeOverride = null;
      approvalDict.recurringIncome = await factory.create('recurring-transaction');
      const { primaryRejectionReason } = serializeApprovalResponse(
        await existingIncomeTimingNode.evaluate(approvalDict, {
          caseResolutionStatus: {},
        } as AdvanceApprovalResult),
        approvalDict,
      );
      expect(primaryRejectionReason).to.be.undefined;
    });

    it('should pass if the next income override is today in UTC but tomorrow in user timezone', async () => {
      const today = moment().startOf('day'); // midnight UTC = 4/5 PM in DEFAULT_TIMEZONE
      const expectedDate = today.clone();
      approvalDict.today = today.clone();
      approvalDict.expectedPaycheck = null;
      approvalDict.incomeOverride = { payDate: expectedDate };
      approvalDict.recurringIncome = await factory.create('recurring-transaction');
      const { primaryRejectionReason } = serializeApprovalResponse(
        await existingIncomeTimingNode.evaluate(approvalDict, {
          caseResolutionStatus: {},
        } as AdvanceApprovalResult),
        approvalDict,
      );
      expect(primaryRejectionReason).to.be.undefined;
    });

    it(`should pass if the next income override is ${MAX_DAYS_UNTIL_PAYCHECK} days out`, async () => {
      const today = moment('2020-10-12T07:00:00Z'); // Oct 12 at 12:00 AM in DEFAULT_TIMEZONE
      const expectedDate = moment('2020-10-23T00:00:00Z');
      approvalDict.today = today.clone();
      approvalDict.expectedPaycheck = null;
      approvalDict.incomeOverride = { payDate: expectedDate };
      approvalDict.recurringIncome = { skipValidityCheck: false, missed: null };
      const { primaryRejectionReason } = serializeApprovalResponse(
        await existingIncomeTimingNode.evaluate(approvalDict, {
          caseResolutionStatus: {},
        } as AdvanceApprovalResult),
        approvalDict,
      );
      expect(primaryRejectionReason).to.be.undefined;
    });

    it(`should pass if the next income override is less than ${MAX_DAYS_UNTIL_PAYCHECK} days out`, async () => {
      const today = moment('2020-10-13T07:00:00Z'); // Oct 13 at 12:00 AM in DEFAULT_TIMEZONE
      const expectedDate = moment('2020-10-23T00:00:00Z');
      approvalDict.today = today.clone();
      approvalDict.expectedPaycheck = null;
      approvalDict.incomeOverride = { payDate: expectedDate };
      approvalDict.recurringIncome = { skipValidityCheck: false, missed: null };
      const { primaryRejectionReason } = serializeApprovalResponse(
        await existingIncomeTimingNode.evaluate(approvalDict, {
          caseResolutionStatus: {},
        } as AdvanceApprovalResult),
        approvalDict,
      );
      expect(primaryRejectionReason).to.be.undefined;
    });
  });
});
