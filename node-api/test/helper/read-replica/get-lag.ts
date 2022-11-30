import { expect } from 'chai';
import * as sinon from 'sinon';
import { getReadReplicaLag } from '../../../src/helper/read-replica';
import { ReplicaLagKey } from '../../../src/crons/fetch-and-store-read-replica-lag';
import redisClient from '../../../src/lib/redis';
import { clean } from '../../test-helpers';

describe('helper/read-replica/get-lag', () => {
  const sandbox = sinon.createSandbox();

  before(() => clean());
  afterEach(() => clean(sandbox));

  it('returns undefined when value is not set', async () => {
    const val = await getReadReplicaLag(false);
    expect(val).to.be.undefined;
  });

  it('returns parsed number when value is set', async () => {
    await redisClient.setAsync(ReplicaLagKey, '18');

    const val = await getReadReplicaLag(false);

    expect(val).to.eq(18);
  });

  it('caches value in memory', async () => {
    const redisStub = sandbox.stub(redisClient, 'getAsync').callThrough();

    await redisClient.setAsync(ReplicaLagKey, '18');

    await getReadReplicaLag();
    await getReadReplicaLag();

    sinon.assert.calledOnce(redisStub);
  });
});
