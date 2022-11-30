import { cloneDeep } from 'lodash';
import * as sinon from 'sinon';
import { forceExperimentBucketing } from '@dave-inc/experiment';
import { AdvanceType } from '@dave-inc/wire-typings';
import { expect } from 'chai';
import 'mocha';

import { TestNode } from '../test-helpers';
import factory from '../../../../factories';
import { clean, stubUnderwritingML } from '../../../../test-helpers';
import stubBankTransactionClient from '../../../../test-helpers/stub-bank-transaction-client';

import {
  serializeApprovalResponse,
  buildApprovalDict,
  getDefaultApprovalResult,
} from '../../../../../src/services/advance-approval/advance-approval-engine';
import { APPROVED_AMOUNTS_BY_MAX_AMOUNT } from '../../../../../src/services/advance-approval/advance-approval-engine/common';
import {
  AdvanceApprovalResult,
  AdvanceApprovalTrigger,
  UnderwritingModelConfigKey,
} from '../../../../../src/services/advance-approval/types';
import { UnderwritingModelType } from '../../../../../src/lib/oracle';
import { buildIncomeValidationSuccessML } from '../../../../../src/services/advance-approval/advance-approval-engine/nodes/income-validation-success-ml';
import { getApprovalBankAccount } from '../../../../../src/domain/advance-approval-request';

describe('services/advance-approval/advance-approval-engine/nodes/income-validation-success-ml', () => {
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
      { totalAdvancesTaken: 5, outstandingAdvance: null },
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
        [UnderwritingModelConfigKey.IncomeValidationSuccessUWv2]: false,
      });
      modelStub = stubUnderwritingML(sandbox, {
        modelType: UnderwritingModelType.GlobalModelRandomSample,
      });
    });

    afterEach(() => clean(sandbox));

    it('should query prod model', async () => {
      modelStub.resolves({ score: 1.0 });

      const failureNode = new TestNode();
      const node = buildIncomeValidationSuccessML(failureNode);
      await node.evaluate(approvalDict, approvalResponse);

      expect(modelStub.callCount).to.equal(1);
      const [req] = modelStub.firstCall.args;
      expect(req.modelType).to.equal(UnderwritingModelType.GlobalModelRandomSample);
    });

    it('should fail with a really low score', async () => {
      modelStub.resolves({ score: 0.45 });

      const failureNode = new TestNode();
      const node = buildIncomeValidationSuccessML(failureNode);
      const events = serializeApprovalResponse(
        await node.evaluate(approvalDict, approvalResponse),
        approvalDict,
      );

      expect(events.approvedAmounts).to.deep.eq([]);
      expect(events.normalAdvanceApproved).to.eq(false);
      expect(events.microAdvanceApproved).to.eq(false);
      expect(events.approved).to.equal(false);
    });

    it('should advance $100', async () => {
      modelStub.resolves({ score: 0.98 });
      const failureNode = new TestNode();
      const node = buildIncomeValidationSuccessML(failureNode);
      const events = serializeApprovalResponse(
        await node.evaluate(approvalDict, approvalResponse),
        approvalDict,
      );

      expect(events.approvedAmounts).to.deep.eq(APPROVED_AMOUNTS_BY_MAX_AMOUNT[100]);
      expect(events.normalAdvanceApproved).to.eq(true);
      expect(events.microAdvanceApproved).to.eq(false);
      expect(events.advanceType).to.eq(AdvanceType.normalAdvance);
      expect(events.approved).to.equal(true);
    });

    it('should call failure node if ML errors', async () => {
      modelStub.rejects('WOW what a cool error');

      const spy = sandbox.spy();
      const failureNode = new TestNode(spy);

      const node = buildIncomeValidationSuccessML(failureNode);
      await node.evaluate(approvalDict, approvalResponse);

      expect(spy.calledOnce).to.be.true;
    });
  });

  describe('UWv2 model', () => {
    beforeEach(async () => {
      forceExperimentBucketing(sandbox, {
        [UnderwritingModelConfigKey.IncomeValidationSuccessUWv2]: true,
      });
      modelStub = stubUnderwritingML(sandbox, {
        modelType: UnderwritingModelType.GlobalModelV2,
      });
    });

    afterEach(() => clean(sandbox));

    it('should query UWv2 model', async () => {
      modelStub.resolves({ score: 1.0 });

      const failureNode = new TestNode();
      const node = buildIncomeValidationSuccessML(failureNode);
      await node.evaluate(approvalDict, approvalResponse);

      expect(modelStub.callCount).to.equal(1);
      const [req] = modelStub.firstCall.args;
      expect(req.modelType).to.equal(UnderwritingModelType.GlobalModelV2);
    });

    it(`should fail with a low score`, async () => {
      modelStub.resolves({ score: 0.573 });

      const failureNode = new TestNode();
      const node = buildIncomeValidationSuccessML(failureNode);

      const approvalDictNumTaken = cloneDeep(approvalDict);
      const events = serializeApprovalResponse(
        await node.evaluate(approvalDictNumTaken, approvalResponse),
        approvalDictNumTaken,
      );

      expect(events.approvedAmounts).to.deep.eq([]);
      expect(events.normalAdvanceApproved).to.eq(false);
      expect(events.microAdvanceApproved).to.eq(false);
      expect(events.approved).to.equal(false);
    });

    [
      [100, 0.885],
      [75, 0.79],
      [50, 0.789],
    ].forEach(([amount, mockScore]) => {
      it(`should approve amount ${amount} with a score of ${mockScore}`, async () => {
        modelStub.resolves({ score: mockScore });

        const failureNode = new TestNode();
        const node = buildIncomeValidationSuccessML(failureNode);

        const approvalDictNumTaken = cloneDeep(approvalDict);
        const events = serializeApprovalResponse(
          await node.evaluate(approvalDictNumTaken, approvalResponse),
          approvalDictNumTaken,
        );

        expect(events.approvedAmounts).to.deep.eq(APPROVED_AMOUNTS_BY_MAX_AMOUNT[amount]);
        expect(events.normalAdvanceApproved).to.eq(true);
        expect(events.microAdvanceApproved).to.eq(false);
        expect(events.advanceType).to.eq(AdvanceType.normalAdvance);
        expect(events.approved).to.equal(true);
      });
    });

    it('should call failure node if ML errors', async () => {
      modelStub.rejects('WOW what a cool error');

      const spy = sandbox.spy();
      const failureNode = new TestNode(spy);

      const node = buildIncomeValidationSuccessML(failureNode);
      await node.evaluate(approvalDict, approvalResponse);

      expect(spy.calledOnce).to.be.true;
    });
  });
});
