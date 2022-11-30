import * as sinon from 'sinon';
import { forceExperimentBucketing } from '@dave-inc/experiment';
import { moment } from '@dave-inc/time-lib';
import { AdvanceType } from '@dave-inc/wire-typings';
import { expect } from 'chai';
import 'mocha';

import factory from '../../../../factories';
import { clean, stubUnderwritingML } from '../../../../test-helpers';
import stubBankTransactionClient from '../../../../test-helpers/stub-bank-transaction-client';

import {
  serializeApprovalResponse,
  buildApprovalDict,
  getDefaultApprovalResult,
} from '../../../../../src/services/advance-approval/advance-approval-engine';
import {
  AdvanceApprovalResult,
  AdvanceApprovalTrigger,
  UnderwritingModelConfigKey,
} from '../../../../../src/services/advance-approval/types';
import { UnderwritingModelType } from '../../../../../src/lib/oracle';
import { APPROVED_AMOUNTS_BY_MAX_AMOUNT } from '../../../../../src/services/advance-approval/advance-approval-engine/common';
import { buildAccountAgeFailureML } from '../../../../../src/services/advance-approval/advance-approval-engine/nodes/account-age-failure-ml';
import { getApprovalBankAccount } from '../../../../../src/domain/advance-approval-request';

describe('services/advance-approval/advance-approval-engine/nodes/account-age-failure-ml', () => {
  let approvalDict: any;
  let approvalResponse: AdvanceApprovalResult;
  let modelStub: sinon.SinonStub;

  const sandbox = sinon.createSandbox();

  before(() => clean());

  beforeEach(async () => {
    stubBankTransactionClient(sandbox);
    const bankAccount = await factory.create('bank-account');
    approvalDict = await buildApprovalDict(
      bankAccount.userId,
      await getApprovalBankAccount(bankAccount),
      { totalAdvancesTaken: 10, outstandingAdvance: null },
      null,
      AdvanceApprovalTrigger.UserTerms,
      'America/New_York',
      { auditLog: true },
    );
    approvalResponse = getDefaultApprovalResult(approvalDict, {});
  });

  describe('prod model', () => {
    beforeEach(async () => {
      forceExperimentBucketing(sandbox, {
        [UnderwritingModelConfigKey.AccountAgeFailureUWv2]: false,
      });
      modelStub = stubUnderwritingML(sandbox, {
        modelType: UnderwritingModelType.GlobalModelRandomSample,
      });
    });

    afterEach(() => clean(sandbox));

    it('should query prod model', async () => {
      modelStub.resolves({ score: 1.0 });

      const node = buildAccountAgeFailureML();
      await node.evaluate(approvalDict, approvalResponse);

      expect(modelStub.callCount).to.equal(1);
      const [req] = modelStub.firstCall.args;
      expect(req.modelType).to.equal(UnderwritingModelType.GlobalModelRandomSample);
    });

    it('should fail with a really low score', async () => {
      modelStub.resolves({ score: 0.989 });

      const node = buildAccountAgeFailureML();
      const events = serializeApprovalResponse(
        await node.evaluate(approvalDict, approvalResponse),
        approvalDict,
      );

      expect(events.approvedAmounts).to.deep.eq([]);
      expect(events.normalAdvanceApproved).to.eq(false);
      expect(events.microAdvanceApproved).to.eq(false);
      expect(events.approved).to.equal(false);
    });

    it('should advance $75 a normal advance with an income', async () => {
      modelStub.resolves({ score: 0.991 });
      approvalDict.recurringIncome = await factory.create('recurring-transaction', {
        bankAccountId: approvalDict.bankAccount.id,
        userId: approvalDict.userId,
        userAmount: 1000,
        skipValidityCheck: false,
      });
      approvalDict.expectedPaycheck = await factory.create('expected-transaction', {
        bankAccountId: approvalDict.bankAccount.id,
        userId: approvalDict.userId,
        recurringTransactionId: approvalDict.recurringIncome.id,
        expectedDate: moment().add(2, 'days'),
      });

      const node = buildAccountAgeFailureML();
      const events = serializeApprovalResponse(
        await node.evaluate(approvalDict, approvalResponse),
        approvalDict,
      );

      expect(events.approvedAmounts).to.deep.eq(APPROVED_AMOUNTS_BY_MAX_AMOUNT[75]);
      expect(events.normalAdvanceApproved).to.eq(true);
      expect(events.microAdvanceApproved).to.eq(false);
      expect(events.advanceType).to.eq(AdvanceType.normalAdvance);
      expect(events.approved).to.equal(true);
    });

    it('should fail if ml errors', async () => {
      modelStub.rejects('WOW what a cool error');

      const node = buildAccountAgeFailureML();
      const events = serializeApprovalResponse(
        await node.evaluate(approvalDict, approvalResponse),
        approvalDict,
      );
      expect(events.approvedAmounts).to.deep.equal([]);
      expect(events.normalAdvanceApproved).to.equal(false);
      expect(events.microAdvanceApproved).to.equal(false);
      expect(events.approved).to.equal(false);
    });
  });

  describe('UWv2 model', () => {
    beforeEach(async () => {
      forceExperimentBucketing(sandbox, {
        [UnderwritingModelConfigKey.AccountAgeFailureUWv2]: true,
      });
      modelStub = stubUnderwritingML(sandbox, {
        modelType: UnderwritingModelType.GlobalModelV2,
      });
    });

    afterEach(() => clean(sandbox));

    it('should query UWv2 model', async () => {
      modelStub.resolves({ score: 1.0 });

      const node = buildAccountAgeFailureML();
      await node.evaluate(approvalDict, approvalResponse);

      expect(modelStub.callCount).to.equal(1);
      const [req] = modelStub.firstCall.args;
      expect(req.modelType).to.equal(UnderwritingModelType.GlobalModelV2);
    });

    it('should fail with a really low score', async () => {
      modelStub.resolves({ score: 0.952 });

      const node = buildAccountAgeFailureML();
      const events = serializeApprovalResponse(
        await node.evaluate(approvalDict, approvalResponse),
        approvalDict,
      );

      expect(events.approvedAmounts).to.deep.eq([]);
      expect(events.normalAdvanceApproved).to.eq(false);
      expect(events.microAdvanceApproved).to.eq(false);
      expect(events.approved).to.equal(false);
    });

    it('should advance $75 a normal advance with an income', async () => {
      modelStub.resolves({ score: 0.954 });
      approvalDict.recurringIncome = await factory.create('recurring-transaction', {
        bankAccountId: approvalDict.bankAccount.id,
        userId: approvalDict.userId,
        userAmount: 1000,
        skipValidityCheck: false,
      });
      approvalDict.expectedPaycheck = await factory.create('expected-transaction', {
        bankAccountId: approvalDict.bankAccount.id,
        userId: approvalDict.userId,
        recurringTransactionId: approvalDict.recurringIncome.id,
        expectedDate: moment().add(2, 'days'),
      });

      const node = buildAccountAgeFailureML();
      const events = serializeApprovalResponse(
        await node.evaluate(approvalDict, approvalResponse),
        approvalDict,
      );

      expect(events.approvedAmounts).to.deep.eq(APPROVED_AMOUNTS_BY_MAX_AMOUNT[75]);
      expect(events.normalAdvanceApproved).to.eq(true);
      expect(events.microAdvanceApproved).to.eq(false);
      expect(events.advanceType).to.eq(AdvanceType.normalAdvance);
      expect(events.approved).to.equal(true);
    });

    it('should fail if ml errors', async () => {
      modelStub.rejects('WOW what a cool error');

      const node = buildAccountAgeFailureML();
      const events = serializeApprovalResponse(
        await node.evaluate(approvalDict, approvalResponse),
        approvalDict,
      );
      expect(events.approvedAmounts).to.deep.equal([]);
      expect(events.normalAdvanceApproved).to.equal(false);
      expect(events.microAdvanceApproved).to.equal(false);
      expect(events.approved).to.equal(false);
    });
  });
});
