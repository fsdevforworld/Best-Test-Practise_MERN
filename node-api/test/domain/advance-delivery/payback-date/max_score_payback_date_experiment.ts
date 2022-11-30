import { expect } from 'chai';
import * as sinon from 'sinon';
import { SinonStub } from 'sinon';
import {
  AdvanceApprovalCreateResponse,
  AdvanceApprovalTrigger,
} from '../../../../src/services/advance-approval/types';
import { AdvanceApproval } from '../../../../src/models';
import { moment } from '@dave-inc/time-lib';
import {
  clean,
  stubBalanceLogClient,
  stubLoomisClient,
  stubPredictedPaybackML,
  stubUnderwritingML,
} from '../../../test-helpers';
import factory from '../../../factories';
import stubBankTransactionClient from '../../../test-helpers/stub-bank-transaction-client';
import { conditionallyAdjustPaybackDate } from '../../../../src/domain/advance-delivery';

describe('AdvanceApprovalEngine', () => {
  const sandbox = sinon.createSandbox();

  beforeEach(() => {
    stubBalanceLogClient(sandbox);
    stubBankTransactionClient(sandbox);
    stubLoomisClient(sandbox);
  });
  afterEach(() => clean(sandbox));

  context('max_score_payback_date_experiment', () => {
    let approval: AdvanceApprovalCreateResponse;
    let predictedPaybackStub: SinonStub;
    beforeEach(async () => {
      predictedPaybackStub = stubPredictedPaybackML(sandbox);
      const advanceApproval = await factory.create('advance-approval', {
        userId: 2649,
        bankAccountId: 2633,
      });
      approval = {
        id: advanceApproval.id,
        userId: 2649,
        bankAccountId: 2633,
        approvedAmounts: [25, 50, 75],
        rejectionReasons: [],
        defaultPaybackDate: moment()
          .add(3, 'days')
          .ymd(),
        recurringTransactionId: 2224,
        recurringTransactionUuid: null,
        isExperimental: false,
        incomeValid: true,
        approved: true,
        primaryRejectionReason: null,
        microAdvanceApproved: true,
        normalAdvanceApproved: false,
        advanceType: 'NORMAL_ADVANCE',
      } as any;
    });

    it('predicts payback date for invalid income', async () => {
      const PREDICTED_PAYBACK_DATE = moment('2020-01-12');
      stubUnderwritingML(sandbox, { score: 0.8 });
      approval.incomeValid = false;

      predictedPaybackStub.returns(PREDICTED_PAYBACK_DATE);

      const updated = await conditionallyAdjustPaybackDate(
        approval,
        AdvanceApprovalTrigger.UserTerms,
      );

      expect(updated.defaultPaybackDate).to.deep.eq(PREDICTED_PAYBACK_DATE.ymd());

      const advanceApproval = await AdvanceApproval.findByPk(updated.id);

      expect(advanceApproval.defaultPaybackDate).to.deep.eq(PREDICTED_PAYBACK_DATE);
    });

    it('does not predict payback date for valid income', async () => {
      const PREDICTED_PAYBACK_DATE = moment('2020-01-12');
      stubUnderwritingML(sandbox, { score: 0.8 });
      approval.incomeValid = true;
      approval.microAdvanceApproved = false;
      approval.normalAdvanceApproved = true;

      predictedPaybackStub.returns(PREDICTED_PAYBACK_DATE);

      const updated = await conditionallyAdjustPaybackDate(
        approval,
        AdvanceApprovalTrigger.UserTerms,
      );

      expect(updated.defaultPaybackDate).to.not.deep.eq(PREDICTED_PAYBACK_DATE.ymd());

      const advanceApproval = await AdvanceApproval.findByPk(updated.id);
      expect(advanceApproval.defaultPaybackDate).to.not.deep.eq(PREDICTED_PAYBACK_DATE);
    });

    it('should use original default payback date if prediction fails', async () => {
      stubUnderwritingML(sandbox, { score: 0.8 });

      predictedPaybackStub.throws(new TypeError("Cannot read property 'predictions' of undefined"));
      await conditionallyAdjustPaybackDate(approval, AdvanceApprovalTrigger.UserTerms);

      sinon.assert.calledOnce(predictedPaybackStub);
      expect(approval.defaultPaybackDate).to.exist;
    });
  });
});
