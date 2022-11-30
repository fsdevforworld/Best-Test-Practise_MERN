import 'mocha';
import { expect } from 'chai';
import * as sinon from 'sinon';

import redisClient from '../../../src/lib/redis';
import {
  ActiveCollectionPrefix,
  setActiveCollection,
  getActiveCollection,
  isActiveCollection,
} from '../../../src/domain/active-collection';

describe('domain/active-collection', () => {
  const sandbox = sinon.createSandbox();

  beforeEach(() => sandbox.restore());

  after(() => sandbox.restore());

  it('should set and get active collection key', async () => {
    await setActiveCollection('foo-id', 'some-collection');
    const result = await getActiveCollection('foo-id');

    expect(result).to.equal('some-collection');
  });

  it('should set active collection key with TTL', async () => {
    await setActiveCollection('bar-id', 'some-collection', 1250);
    const result = await getActiveCollection('bar-id');

    expect(result).to.equal('some-collection');
    const ttl = await redisClient.ttlAsync(`${ActiveCollectionPrefix}-bar-id`);
    expect(ttl).to.equal(1250);
  });

  it('should not get non-existent key', async () => {
    const result = await getActiveCollection('baz-id');
    expect(result).to.not.exist;
  });

  it('should determine if collection is active', async () => {
    await setActiveCollection('bar-id', 'some-collection');

    const result0 = await isActiveCollection('bar-id', 'some-collection');
    expect(result0).to.be.true;

    const result1 = await isActiveCollection('bar-id', 'some-other-collection');
    expect(result1).to.be.false;
  });
});
