import { expect } from 'chai';
import * as sinon from 'sinon';
import factory from '../../../../factories';
import { clean } from '../../../../test-helpers';
import {
  serializeApprovalResponse,
  SOLVENCY_AMOUNT,
} from '../../../../../src/services/advance-approval/advance-approval-engine';
import PaydaySolvencyNode from '../../../../../src/services/advance-approval/advance-approval-engine/nodes/payday-solvency-node';
import * as Solvency from '../../../../../src/services/advance-approval/advance-approval-engine/solvency';
import { moment } from '@dave-inc/time-lib';
import { AdvanceApprovalResult } from '../../../../../src/services/advance-approval/types';
import stubBankTransactionClient from '../../../../test-helpers/stub-bank-transaction-client';

describe('PaydaySolvencyNode', () => {
  const sandbox = sinon.createSandbox();
  let engine: PaydaySolvencyNode;
  let approvalDict: any = {};

  beforeEach(async () => {
    stubBankTransactionClient(sandbox);
    const bankAccount = await factory.create('bank-account');
    approvalDict = {
      bankAccount,
      previousPaychecks: [],
      bankConnection: await bankAccount.getBankConnection(),
    };
    engine = new PaydaySolvencyNode();
  });

  afterEach(() => clean(sandbox));
  const passAmount = SOLVENCY_AMOUNT + 10;
  const failAmount = SOLVENCY_AMOUNT - 10;

  it('should not fail if no paycheck', async () => {
    const events = serializeApprovalResponse(
      await engine.evaluate(approvalDict, {
        caseResolutionStatus: {},
        extra: {},
      } as AdvanceApprovalResult),
      approvalDict,
    );
    expect(events.primaryRejectionReason).to.be.null;
  });

  it('should fail if the account is insolvent and cant qualify for micro advance', async () => {
    const expectedDate = moment().subtract(5, 'days');
    approvalDict.previousPaychecks = [{ transactionDate: expectedDate }];
    approvalDict.recurringIncome = {};
    approvalDict.lastPaycheckAccountBalance = failAmount;
    sandbox.stub(Solvency, 'lastPaycheckTwoDayMaxAccountBalance').resolves(failAmount);
    const events = serializeApprovalResponse(
      await engine.evaluate(approvalDict, {
        caseResolutionStatus: {},
        extra: {},
      } as AdvanceApprovalResult),
      approvalDict,
    );
    expect(events.primaryRejectionReason).to.be.an('object');
    expect(events.primaryRejectionReason.type).to.equal('historical-payday-insolvent');
  });

  it('should pass if the account is solvent', async () => {
    const expectedDate = moment().subtract(5, 'days');
    approvalDict.previousPaychecks = [{ transactionDate: expectedDate }];
    approvalDict.recurringIncome = {};
    sandbox.stub(Solvency, 'lastPaycheckTwoDayMaxAccountBalance').resolves(passAmount);
    const events = serializeApprovalResponse(
      await engine.evaluate(approvalDict, {
        caseResolutionStatus: {},
        extra: {},
      } as AdvanceApprovalResult),
      approvalDict,
    );
    expect(events.primaryRejectionReason).to.be.null;
  });

  it('should pass if the account is solvent day after payday', async () => {
    const expectedDate = moment().subtract(5, 'days');
    const dayAfterPayday = moment(expectedDate).add(1, 'days');
    approvalDict.previousPaychecks = [{ transactionDate: expectedDate }];
    approvalDict.recurringIncome = {};
    sandbox
      .stub(Solvency, 'lastPaycheckTwoDayMaxAccountBalance')
      .callsFake((bankAccountId, pastPaychecks, options) => {
        if (
          pastPaychecks.transactionDate.isSame(dayAfterPayday, 'date') ||
          pastPaychecks.transactionDate.isSame(expectedDate, 'date')
        ) {
          return passAmount;
        }
        return failAmount;
      });
    const events = serializeApprovalResponse(
      await engine.evaluate(approvalDict, {
        caseResolutionStatus: {},
        extra: {},
      } as AdvanceApprovalResult),
      approvalDict,
    );
    expect(events.primaryRejectionReason).to.be.null;
  });
});
