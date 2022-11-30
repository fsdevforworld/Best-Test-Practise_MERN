import { expect } from 'chai';
import * as sinon from 'sinon';

import redisClient from '../../src/lib/redis';
import HeathClient from '../../src/lib/heath-client';
import { run, ReplicaLagKey } from '../../src/crons/fetch-and-store-read-replica-lag';
import { clean } from '../test-helpers';

describe('crons/fetch-and-store-read-replica-lag', () => {
  const sandbox = sinon.createSandbox();

  before(() => clean());
  afterEach(() => clean(sandbox));

  it('gets replication lag from Heath and sets it in redis', async () => {
    const heathStub = sandbox
      .stub(HeathClient, 'getReplicaLag')
      .resolves({ replicationLagSeconds: 15 });

    await run();

    sinon.assert.calledOnce(heathStub);
    const val = await redisClient.getAsync(ReplicaLagKey);
    expect(val).to.eq('15');
  });
});
