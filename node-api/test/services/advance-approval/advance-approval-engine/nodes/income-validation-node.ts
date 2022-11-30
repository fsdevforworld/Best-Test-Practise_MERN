import * as sinon from 'sinon';
import buildIncomeValidationNode from '../../../../../src/services/advance-approval/advance-approval-engine/nodes/income-validation-node';
import { expect } from 'chai';
import 'mocha';
import { moment } from '@dave-inc/time-lib';
import { RecurringTransactionStatus } from '../../../../../src/typings';
import { AdvanceApprovalResult } from '../../../../../src/services/advance-approval/types';
import { clean } from '../../../../test-helpers';
import factory from '../../../../factories';
import { serializeApprovalResponse } from '../../../../../src/services/advance-approval/advance-approval-engine';
import stubBankTransactionClient from '../../../../test-helpers/stub-bank-transaction-client';
import { RecurringTransactionInterval } from '@dave-inc/wire-typings';
import { DecisionNode } from '../decision-node';
import { NodeNames } from '../../../../../src/services/advance-approval/advance-approval-engine/common';

describe('IncomeValidationNode', () => {
  let approvalDict: any;
  let incomeValidityNode: DecisionNode;
  const sandbox = sinon.createSandbox();

  beforeEach(async () => {
    stubBankTransactionClient(sandbox);
    const bankAccount = await factory.create('bank-account');
    const expectedPaycheck = { expectedDate: moment() };
    approvalDict = {
      bankAccount,
      expectedPaycheck,
      previousPaychecks: [{ transactionDate: moment() }],
      recurringIncome: {},
      incomeOverride: {},
      logExtra: {},
      today: moment(),
    };
  });

  afterEach(() => clean(sandbox));

  context('include single observation income', () => {
    beforeEach(() => {
      incomeValidityNode = buildIncomeValidationNode({ includeSingleObservationIncome: true });
      expect(incomeValidityNode.name).to.eq(NodeNames.IncomeValidationNodeV2);
    });

    it('should succeed if income is observed once', async () => {
      const expectedDate = moment().add(5, 'days');

      approvalDict.incomeOverride = null;
      approvalDict.expectedPaycheck = { expectedDate };
      approvalDict.recurringIncome = await factory.create('recurring-transaction', {
        status: RecurringTransactionStatus.SINGLE_OBSERVATION,
      });

      const events = serializeApprovalResponse(
        await incomeValidityNode.evaluate(approvalDict, {
          caseResolutionStatus: {},
        } as AdvanceApprovalResult),
        approvalDict,
      );

      expect(events.primaryRejectionReason).to.be.undefined;
    });
  });

  context('exclude single observation income', () => {
    beforeEach(() => {
      incomeValidityNode = buildIncomeValidationNode();
      expect(incomeValidityNode.name).to.eq(NodeNames.IncomeValidationNode);
    });

    it('should fail if validity check is skipped', async () => {
      const expectedDate = moment().add(5, 'days');
      approvalDict.incomeOverride = null;
      approvalDict.expectedPaycheck = { expectedDate };
      approvalDict.recurringIncome = await factory.create('recurring-transaction', {
        skipValidityCheck: true,
        status: RecurringTransactionStatus.NOT_VALIDATED,
        missed: moment(),
      });
      const events = serializeApprovalResponse(
        await incomeValidityNode.evaluate(approvalDict, {
          caseResolutionStatus: {},
        } as AdvanceApprovalResult),
        approvalDict,
      );
      expect(events.primaryRejectionReason).to.be.an('object');
      expect(events.primaryRejectionReason.type).to.equal('income-valid');
    });

    it('should fail if income is only observed once', async () => {
      const expectedDate = moment().add(5, 'days');

      approvalDict.incomeOverride = null;
      approvalDict.expectedPaycheck = { expectedDate };
      approvalDict.recurringIncome = await factory.create('recurring-transaction', {
        status: RecurringTransactionStatus.SINGLE_OBSERVATION,
      });

      const events = serializeApprovalResponse(
        await incomeValidityNode.evaluate(approvalDict, {
          caseResolutionStatus: {},
        } as AdvanceApprovalResult),
        approvalDict,
      );

      expect(events.primaryRejectionReason).to.be.an('object');
      expect(events.primaryRejectionReason.type).to.equal('income-valid');
    });

    it('should pass even if there is no next predicted expectedPaycheck', async () => {
      // we want to check if income is on the same day or missied or 10 days further etc
      // if there is no income we pass the user that way the user gets sent to
      // small dollar loan
      approvalDict.expectedPaycheck = null;
      approvalDict.incomeOverride = null;
      approvalDict.recurringIncome = await factory.create('recurring-transaction', {
        status: RecurringTransactionStatus.VALID,
        missed: null,
      });
      const events = serializeApprovalResponse(
        await incomeValidityNode.evaluate(approvalDict, {
          extra: {},
          caseResolutionStatus: {},
        } as AdvanceApprovalResult),
        approvalDict,
      );
      expect(events.primaryRejectionReason).to.be.undefined;
    });

    it('should fail if the income has a PENDING_VERIFICATION status', async () => {
      approvalDict.expectedPaycheck = null;
      approvalDict.incomeOverride = null;
      approvalDict.recurringIncome = await factory.create('recurring-transaction', {
        skipValidityCheck: false,
        missed: null,
        status: RecurringTransactionStatus.PENDING_VERIFICATION,
        transactionDisplayName: 'Cash Deposit',
      });
      approvalDict.previousPaychecks = [
        { amount: 250, transactionDate: moment('2018-4-12') },
        { amount: 200, transactionDate: moment('2018-4-14') },
      ];
      const events = serializeApprovalResponse(
        await incomeValidityNode.evaluate(approvalDict, {
          extra: {},
          caseResolutionStatus: {},
        } as AdvanceApprovalResult),
        approvalDict,
      );
      expect(events.primaryRejectionReason.type).to.eq('waiting-for-first-match');
      expect(events.primaryRejectionReason.message).to.eq(
        "Your paycheck hasn't arrived in your new account yet.",
      );
    });

    it('will fail if the income has an invalid name', async () => {
      approvalDict.expectedPaycheck = null;
      approvalDict.incomeOverride = null;
      approvalDict.recurringIncome = await factory.create('recurring-transaction', {
        skipValidityCheck: false,
        missed: null,
        status: RecurringTransactionStatus.INVALID_NAME,
        transactionDisplayName: 'Cash Deposit',
      });
      approvalDict.previousPaychecks = [
        { amount: 250, transactionDate: moment('2018-4-12') },
        { amount: 200, transactionDate: moment('2018-4-14') },
      ];
      const events = serializeApprovalResponse(
        await incomeValidityNode.evaluate(approvalDict, {
          extra: {},
          caseResolutionStatus: {},
        } as AdvanceApprovalResult),
        approvalDict,
      );
      expect(events.primaryRejectionReason.type).to.eq('income-name-invalid');
      expect(events.primaryRejectionReason.message).to.eq(
        "I can't support Cash Deposit as a valid income source just yet.",
      );
    });

    it('will fail if the income has not arrived recently', async () => {
      approvalDict.expectedPaycheck = null;
      approvalDict.incomeOverride = null;
      approvalDict.recurringIncome = await factory.create('recurring-transaction', {
        skipValidityCheck: false,
        missed: null,
        interval: RecurringTransactionInterval.WEEKLY,
        params: ['friday'],
        status: RecurringTransactionStatus.VALID,
        transactionDisplayName: 'Bacon Farmer',
      });
      approvalDict.previousPaychecks = [
        { amount: 200, transactionDate: moment().subtract(11, 'day') },
      ];
      const events = serializeApprovalResponse(
        await incomeValidityNode.evaluate(approvalDict, {
          extra: {},
          caseResolutionStatus: {},
        } as AdvanceApprovalResult),
        approvalDict,
      );
      expect(events.primaryRejectionReason.type).to.eq('stale-income');
      expect(events.primaryRejectionReason.message).to.eq("Your last paycheck hasn't come in yet.");
    });

    it('uses expected payback date for no income on failure', async () => {
      approvalDict.incomeOverride = null;
      approvalDict.recurringIncome = await factory.create('recurring-transaction', {
        skipValidityCheck: false,
        missed: null,
        status: RecurringTransactionStatus.INVALID_NAME,
        transactionDisplayName: 'Cash Deposit',
      });

      const events = serializeApprovalResponse(
        await incomeValidityNode.evaluate(approvalDict, {
          extra: {},
          caseResolutionStatus: {},
        } as AdvanceApprovalResult),
        approvalDict,
      );
      expect(events.approved).to.be.false;
      expect(moment(events.defaultPaybackDate).isAfter(approvalDict.today)).to.be.true;
    });
  });
});
