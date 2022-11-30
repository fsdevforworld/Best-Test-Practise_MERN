import ExperimentGateNode from '../../../../../src/services/advance-approval/advance-approval-engine/experiments/experiment-gate-node';
import {
  ExperimentId,
  updateAdvanceExperiments,
} from '../../../../../src/services/advance-approval/advance-approval-engine/experiments';
import { AdvanceExperiment } from '../../../../../src/models';
import factory from '../../../../factories';
import AdvanceExperimentLog from '../../../../../src/models/advance-experiment-log';
import { expect } from 'chai';
import * as ApprovalEngine from '../../../../../src/services/advance-approval/advance-approval-engine/build-engine';
import * as sinon from 'sinon';
import Advance from '../../../../../src/models/advance';

describe('update-experiments', () => {
  const sandbox = sinon.createSandbox();

  afterEach(() => sandbox.restore());

  describe('updateAdvanceExperiments', () => {
    const testExperimentNode = new ExperimentGateNode({
      id: ExperimentId.Covid19ReturnExistingUsersToBaselineExperiment,
      name: 'covid_19_return_existing_users_to_baseline',
      description: 'Buffalo buffalo buffalo Buffalo buffalo buffalo.',
      ratio: 0.5,
      isSuccessful: async () => true,
    });

    beforeEach(async () => {
      await AdvanceExperiment.findOrCreate({
        defaults: {
          id: testExperimentNode.id,
          name: testExperimentNode.name,
          description: testExperimentNode.description,
          version: 1,
        },
        where: { id: testExperimentNode.id },
      });
    });

    it('Should update not successful experiments', async () => {
      const advance: Advance = await factory.create('advance');
      const log: AdvanceExperimentLog = await factory.create('advance-experiment-log', {
        success: false,
      });
      await updateAdvanceExperiments({
        advanceId: advance.id,
        advanceApprovalId: log.advanceApprovalId,
      });
      await log.reload();
      expect(log.advanceId).to.eq(advance.id);
    });

    it('Should call onAdvanceCreated with isFirstAdvanceForExperiment=true if previously got an advance with this experiment', async () => {
      sandbox.stub(ApprovalEngine, 'buildAdvanceApprovalEngine').returns(testExperimentNode);
      const stub = sandbox.stub(ExperimentGateNode.prototype, 'onAdvanceCreated').resolves();

      const oldAdvance = await factory.create('advance', {
        createdDate: '2019-12-12',
      });
      await factory.create('advance-experiment-log', {
        advanceId: oldAdvance.id,
        userId: oldAdvance.userId,
        success: false,
        advanceExperimentId: testExperimentNode.id,
      });
      const newAdvance = await factory.create('advance', { userId: oldAdvance.userId });
      const log = await factory.create('advance-experiment-log', {
        advanceId: newAdvance.id,
        userId: newAdvance.userId,
        success: false,
        advanceExperimentId: testExperimentNode.id,
      });
      newAdvance.chosenAdvanceApprovalId = log.advanceApprovalId;
      await updateAdvanceExperiments({
        advanceId: newAdvance.id,
        advanceApprovalId: log.advanceApprovalId,
      });

      sinon.assert.calledWith(stub, {
        advanceId: newAdvance.id,
        experimentLog: sinon.match({ id: log.id }),
        isFirstAdvanceForExperiment: true,
      });
    });

    it('Should call onAdvanceCreated with isFirstAdvanceForExperiment=false if this is first advance with this experiment', async () => {
      const stub = sandbox.stub(testExperimentNode, 'onAdvanceCreated').resolves();
      sandbox.stub(ApprovalEngine, 'buildAdvanceApprovalEngine').returns(testExperimentNode);
      const newAdvance = await factory.create('advance');
      const log = await factory.create('advance-experiment-log', {
        advanceId: newAdvance.id,
        userId: newAdvance.userId,
        success: false,
        advanceExperimentId: testExperimentNode.id,
      });
      newAdvance.chosenAdvanceApprovalId = log.advanceApprovalId;
      await updateAdvanceExperiments({
        advanceId: newAdvance.id,
        advanceApprovalId: log.advanceApprovalId,
      });

      sinon.assert.calledWith(stub, {
        advanceId: newAdvance.id,
        experimentLog: sinon.match({ id: log.id }),
        isFirstAdvanceForExperiment: true,
      });

      sinon.assert.calledWith(stub, {
        advanceId: newAdvance.id,
        experimentLog: sinon.match({ id: log.id }),
        isFirstAdvanceForExperiment: true,
      });
    });
  });
});
