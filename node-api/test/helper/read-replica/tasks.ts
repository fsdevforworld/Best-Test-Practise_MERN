import { expect } from 'chai';
import * as sinon from 'sinon';
import * as GetLag from '../../../src/helper/read-replica/get-lag';
import {
  TaskTooEarlyError,
  shouldTaskUseReadReplica,
} from '../../../src/helper/read-replica/tasks';
import { clean } from '../../test-helpers';

describe('helper/read-replica/tasks', () => {
  const sandbox = sinon.createSandbox();

  let replicaLagStub: sinon.SinonStub;

  beforeEach(() => {
    replicaLagStub = sandbox.stub(GetLag, 'getReadReplicaLag').resolves();
  });
  afterEach(() => clean(sandbox));

  it('should use read replica if replica caught up to task creation time', async () => {
    replicaLagStub.resolves(600); // 10 minutes
    const req = {
      get: () => Date.now() - 700000,
    } as any;

    const useReplica = await shouldTaskUseReadReplica(req, 300);
    expect(useReplica).to.equal(true);
  });

  it('should not use read replica if lag is more than max', async () => {
    replicaLagStub.resolves(600); // 10 minutes
    const req = {
      get: () => Date.now(),
    } as any;

    const useReplica = await shouldTaskUseReadReplica(req, 300);
    expect(useReplica).to.equal(false);
  });

  it('should throw exception replica lag behind task creation and less than max', async () => {
    replicaLagStub.resolves(600); // 10 minutes
    const req = {
      get: () => Date.now(),
    } as any;

    const useReplica = shouldTaskUseReadReplica(req, 3000);
    expect(useReplica).to.be.rejectedWith(TaskTooEarlyError);
  });
});
