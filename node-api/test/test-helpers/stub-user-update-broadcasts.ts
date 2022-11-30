import { SinonSandbox } from 'sinon';
import * as Jobs from '../../src/jobs/data';
import { userUpdatedEvent } from '../../src/domain/event';

function stubUserUpdateBroadcasts(sandbox: SinonSandbox) {
  const publishUserUpdatedEventStub = sandbox.stub(userUpdatedEvent, 'publish').resolves();
  const updateBrazeTaskStub = sandbox.stub(Jobs, 'updateBrazeTask').resolves();
  const updateSynapsepayUserTaskStub = sandbox.stub(Jobs, 'updateSynapsepayUserTask').resolves();

  return {
    publishUserUpdatedEventStub,
    updateBrazeTaskStub,
    updateSynapsepayUserTaskStub,
  };
}

export default stubUserUpdateBroadcasts;
