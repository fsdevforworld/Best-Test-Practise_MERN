import { expect } from 'chai';
import { moment, Moment } from '@dave-inc/time-lib';
import { forceExperimentBucketing, ILimiter } from '@dave-inc/experiment';
import * as sinon from 'sinon';

import { stubExperimentLimiter } from '../../test-helpers/stub-experiment-limiter';
import {
  AddOneDayExperiment,
  addOneDayExperiment,
  globalPaybackDateModelExperiment,
  GlobalPaybackDateModelExperiment,
} from '../../../src/domain/advance-delivery';
import { AdvanceApprovalCreateResponse } from '../../../src/services/advance-approval/types';
import { ABTestingEvent, AdvanceApproval } from '../../../src/models';
import * as MachineLearningDomain from '../../../src/domain/machine-learning';

describe('domain/advance-approval-engine/payback-dates', () => {
  const sandbox = sinon.createSandbox();

  let advanceApprovalStub: sinon.SinonStub;
  let abTestingEventStub: sinon.SinonStub;
  let fakeLimiter: ILimiter;

  beforeEach(() => {
    const { limiter } = stubExperimentLimiter(sandbox);
    fakeLimiter = limiter;
    advanceApprovalStub = sandbox.stub(AdvanceApproval, 'update');
    abTestingEventStub = sandbox.stub(ABTestingEvent, 'create');
  });

  afterEach(() => {
    sandbox.restore();
  });

  describe('addOneDayExperiment', () => {
    context('when bucketed', () => {
      const cases = [
        {
          experimentName: AddOneDayExperiment.Friday,
          date: '2020-07-24',
          newDate: '2020-07-25',
        },
        {
          experimentName: AddOneDayExperiment.NotFriday,
          date: '2020-07-22',
          newDate: '2020-07-23',
        },
      ];

      cases.forEach(experimentCase => {
        const { experimentName, date, newDate } = experimentCase;
        context(`experiment ${experimentName}`, () => {
          it('adds a day to defaultPaybackDate', async () => {
            forceExperimentBucketing(sandbox, { [experimentName]: true });

            const defaultPaybackDate = date;
            const expectedNewDate = newDate;

            const approvalId = 1;
            const userId = 1;
            const bankAccountId = 1;

            const approvalResponse: AdvanceApprovalCreateResponse = {
              userId,
              bankAccountId,
              rejectionReasons: [],
              defaultPaybackDate,
              isExperimental: false,
              caseResolutionStatus: {},
              approved: true,
              id: approvalId,
            } as any;

            const updatedApprovalResponse = await addOneDayExperiment(approvalResponse);
            expect(updatedApprovalResponse.defaultPaybackDate).to.eq(expectedNewDate);

            sinon.assert.calledOnce(abTestingEventStub);
            sinon.assert.calledWithExactly(abTestingEventStub, {
              userId,
              eventName: experimentCase.experimentName,
              eventUuid: approvalId,
              extra: {
                oldDate: date,
                newDate,
              },
            });

            sinon.assert.calledOnce(advanceApprovalStub);
            sinon.assert.calledWithExactly(
              advanceApprovalStub,
              {
                defaultPaybackDate: sinon.match((v: Moment) => v.isSame(expectedNewDate, 'day')),
              },
              { where: { id: approvalId } },
            );
          });
        });
      });
    });

    context('when not bucketed', () => {
      const cases = [
        {
          experimentName: AddOneDayExperiment.Friday,
          date: '2020-07-24',
        },
        {
          experimentName: AddOneDayExperiment.NotFriday,
          date: '2020-07-22',
        },
      ];

      cases.forEach(experimentCase => {
        const { experimentName, date } = experimentCase;
        context(`experiment ${experimentName}`, () => {
          it('does not affect defaultPaybackDate', async () => {
            forceExperimentBucketing(sandbox, { [experimentName]: false });

            const defaultPaybackDate = date;
            const approvalId = 1;
            const userId = 1;
            const bankAccountId = 1;

            const approvalResponse: AdvanceApprovalCreateResponse = {
              userId,
              bankAccountId,
              rejectionReasons: [],
              defaultPaybackDate,
              isExperimental: false,
              caseResolutionStatus: {},
              approved: true,
              id: approvalId,
            } as any;

            const updatedApprovalResponse = await addOneDayExperiment(approvalResponse);

            expect(updatedApprovalResponse.defaultPaybackDate).to.eq(date);
            sinon.assert.notCalled(abTestingEventStub);
            sinon.assert.notCalled(advanceApprovalStub);
          });
        });
      });
    });
  });

  describe('globalPaybackDateModelExperiment', () => {
    context('when bucketed', () => {
      it('should return the result from the predicted payback date ml model', async () => {
        forceExperimentBucketing(sandbox, { [GlobalPaybackDateModelExperiment]: true });
        const defaultPaybackDate = '2020-03-16';
        const expectedNewDate = '2020-03-22';
        sandbox.stub(MachineLearningDomain, 'predictPaybackDate').resolves(moment(expectedNewDate));

        const approvalId = 1;
        const userId = 1;
        const bankAccountId = 1;

        const approvalResponse: AdvanceApprovalCreateResponse = {
          userId,
          bankAccountId,
          rejectionReasons: [],
          defaultPaybackDate,
          isExperimental: false,
          caseResolutionStatus: {},
          approved: true,
          id: approvalId,
        } as any;

        const updatedApprovalResponse = await globalPaybackDateModelExperiment(approvalResponse);
        expect(updatedApprovalResponse.defaultPaybackDate).to.eq(expectedNewDate);

        sinon.assert.calledOnce(abTestingEventStub);
        sinon.assert.calledWithExactly(abTestingEventStub, {
          userId,
          eventName: GlobalPaybackDateModelExperiment,
          eventUuid: approvalId,
          extra: {
            oldDate: defaultPaybackDate,
            newDate: expectedNewDate,
          },
        });

        sinon.assert.calledOnce(advanceApprovalStub);
        sinon.assert.calledWithExactly(
          advanceApprovalStub,
          {
            defaultPaybackDate: sinon.match((v: Moment) => v.isSame(expectedNewDate, 'day')),
          },
          { where: { id: approvalId } },
        );
      });
      it('should not increment counter if ml returns null', async () => {
        forceExperimentBucketing(sandbox, { [GlobalPaybackDateModelExperiment]: true });
        const incrStub = sandbox.stub(fakeLimiter, 'increment');

        const defaultPaybackDate = '2020-03-16';
        sandbox.stub(MachineLearningDomain, 'predictPaybackDate').resolves(null);

        const approvalId = 1;
        const userId = 1;
        const bankAccountId = 1;

        const approvalResponse: AdvanceApprovalCreateResponse = {
          userId,
          bankAccountId,
          rejectionReasons: [],
          defaultPaybackDate,
          isExperimental: false,
          caseResolutionStatus: {},
          approved: true,
          id: approvalId,
        } as any;

        const updatedApprovalResponse = await globalPaybackDateModelExperiment(approvalResponse);
        expect(updatedApprovalResponse.defaultPaybackDate).to.eq(defaultPaybackDate);

        sinon.assert.notCalled(abTestingEventStub);
        sinon.assert.notCalled(advanceApprovalStub);
        sinon.assert.notCalled(incrStub);
      });
    });

    context('When not bucketed', () => {
      it('does not effect payback date', async () => {
        forceExperimentBucketing(sandbox, { [GlobalPaybackDateModelExperiment]: false });

        const defaultPaybackDate = '2022-12-12';
        const approvalId = 1;
        const userId = 1;
        const bankAccountId = 1;

        const approvalResponse: AdvanceApprovalCreateResponse = {
          userId,
          bankAccountId,
          rejectionReasons: [],
          defaultPaybackDate,
          isExperimental: false,
          caseResolutionStatus: {},
          approved: true,
          id: approvalId,
        } as any;

        const updatedApprovalResponse = await addOneDayExperiment(approvalResponse);

        expect(updatedApprovalResponse.defaultPaybackDate).to.eq('2022-12-12');
        sinon.assert.notCalled(abTestingEventStub);
        sinon.assert.notCalled(advanceApprovalStub);
      });
    });
  });
});
