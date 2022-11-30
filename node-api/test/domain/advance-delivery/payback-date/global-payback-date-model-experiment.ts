import { expect } from 'chai';
import * as sinon from 'sinon';
import { forceExperimentBucketing } from '@dave-inc/experiment';
import * as MachineLearning from '../../../../src/domain/machine-learning';
import {
  clean,
  stubBalanceLogClient,
  stubBankTransactionClient,
  stubLoomisClient,
} from '../../../test-helpers';
import {
  conditionallyAdjustPaybackDate,
  GlobalPaybackDateModelExperiment,
} from '../../../../src/domain/advance-delivery';
import {
  AdvanceApprovalCreateResponse,
  AdvanceApprovalTrigger,
} from '../../../../src/services/advance-approval/types';
import { moment } from '@dave-inc/time-lib';
import Counter from '../../../../src/lib/counter';

describe('AdvanceApprovalEngine', () => {
  const sandbox = sinon.createSandbox();

  beforeEach(() => {
    sandbox.stub(Counter.prototype, 'getValue').resolves(0);
    sandbox.stub(Counter.prototype, 'increment');
    stubBalanceLogClient(sandbox);
    stubBankTransactionClient(sandbox);
    stubLoomisClient(sandbox);
  });
  afterEach(() => clean(sandbox));

  context('globalPaybackDateModelExperiment', () => {
    const approval: AdvanceApprovalCreateResponse = {
      id: 2,
      userId: 2649,
      bankAccountId: 2633,
      approvedAmounts: [25, 50, 75],
      rejectionReasons: [],
      defaultPaybackDate: moment().add(3, 'days'),
      recurringTransactionId: 2224,
      recurringTransactionUuid: null,
      isExperimental: false,
      incomeValid: true,
      approved: true,
      primaryRejectionReason: null,
      microAdvanceApproved: false,
      normalAdvanceApproved: true,
      advanceType: 'NORMAL_ADVANCE',
    } as any;

    const expectedPaybackDate = moment().add(10, 'day');
    context('when user is bucketed', () => {
      beforeEach(() => {
        forceExperimentBucketing(sandbox, {
          [GlobalPaybackDateModelExperiment]: true,
        });
        sandbox.stub(MachineLearning, 'predictPaybackDate').resolves(expectedPaybackDate);
      });

      it('uses the ml model payback date as the payback date', async () => {
        const updated = await conditionallyAdjustPaybackDate(
          approval,
          AdvanceApprovalTrigger.UserTerms,
        );

        expect(updated.defaultPaybackDate).to.eq(expectedPaybackDate.ymd());
      });
    });

    context('when user is not bucketed', () => {
      beforeEach(() => {
        forceExperimentBucketing(sandbox, {
          [GlobalPaybackDateModelExperiment]: false,
        });
      });

      it('does not change default payback date', async () => {
        const updated = await conditionallyAdjustPaybackDate(
          approval,
          AdvanceApprovalTrigger.UserTerms,
        );

        expect(updated.defaultPaybackDate).to.eq(approval.defaultPaybackDate);
      });
    });

    it('does not run experiment for dry run approval', async () => {
      const experimentStub = forceExperimentBucketing(sandbox, {
        [GlobalPaybackDateModelExperiment]: false,
      });

      await conditionallyAdjustPaybackDate(approval, AdvanceApprovalTrigger.GetPaychecks);

      sinon.assert.notCalled(experimentStub);
    });
  });
});
