import 'mocha';
import { expect } from 'chai';
import * as sinon from 'sinon';

import { setUserCollectibleAdvance } from '../../src/crons/multi-outstanding-advance';
import * as ActiveCollection from '../../src/domain/active-collection';

describe('crons/multi-outstanding-advance', () => {
  const sandbox = sinon.createSandbox();
  let setFlagStub: sinon.SinonStub;

  beforeEach(() => {
    sandbox.restore();
    setFlagStub = sandbox.stub(ActiveCollection, 'setActiveCollection');
  });

  after(() => sandbox.restore());

  it('should set active advance when multiple are found', async () => {
    const userId = 1000;
    const advanceIds = [3981, 483, 23];

    await setUserCollectibleAdvance(userId, advanceIds);

    expect(setFlagStub.callCount).to.equal(1);
    expect(setFlagStub.firstCall.args[0]).to.equal('1000');
    expect(setFlagStub.firstCall.args[1]).to.equal('3981');
    expect(setFlagStub.firstCall.args[2]).to.not.exist;
  });

  it('should throw when only one advance is given', async () => {
    const userId = 1000;
    const advanceIds = [3981];

    await expect(setUserCollectibleAdvance(userId, advanceIds)).to.eventually.be.rejectedWith(
      RangeError,
    );
  });

  it('should set active advance when one is recently paid', async () => {
    const userId = 1000;
    const advanceIds = [3981, 483, 23];
    const lastPaid = {
      advanceId: 10,
      outstanding: 20,
      paymentTime: new Date(),
    };

    await setUserCollectibleAdvance(userId, advanceIds, lastPaid);

    expect(setFlagStub.callCount).to.equal(1);
    expect(setFlagStub.firstCall.args[0]).to.equal('1000');
    expect(setFlagStub.firstCall.args[1]).to.equal('10');
    expect(setFlagStub.firstCall.args[2]).to.not.exist;
  });

  it('should set active advance with TTL when one is recently fully paid off', async () => {
    sandbox.useFakeTimers(new Date('2021-02-06').getTime());

    const userId = 1000;
    const advanceIds = [3981, 483, 23];
    const lastPaid = {
      advanceId: 10,
      outstanding: 0,
      paymentTime: new Date('2021-02-03'),
    };

    await setUserCollectibleAdvance(userId, advanceIds, lastPaid);

    expect(setFlagStub.callCount).to.equal(1);
    expect(setFlagStub.firstCall.args[0]).to.equal('1000');
    expect(setFlagStub.firstCall.args[1]).to.equal('10');

    const ttlSec = setFlagStub.firstCall.args[2];
    expect(ttlSec).to.equal(4 * 24 * 60 * 60);
  });
});
