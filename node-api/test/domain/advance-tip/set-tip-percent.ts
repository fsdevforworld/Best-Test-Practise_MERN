import { ExternalTransactionStatus } from '@dave-inc/wire-typings';
import { expect } from 'chai';
import * as sinon from 'sinon';
import factory from '../../factories';
import {
  advanceFixture,
  bankAccountFixture,
  bankConnectionFixture,
  institutionFixture,
  paymentMethodFixture,
  userFixture,
} from '../../fixtures';
import { clean, up } from '../../test-helpers';
import * as Jobs from '../../../src/jobs/data';
import { Advance, AdvanceTip } from '../../../src/models';
import { Platforms } from '../../../src/typings';
import { setTipPercent } from '../../../src/domain/advance-tip';

describe('setTipPercent', () => {
  const sandbox = sinon.createSandbox();
  let broadcastAdvanceTipChangedJobStub: sinon.SinonStub;
  const ip = 'ip';
  const appsflyerDeviceId = 'appsflyerDeviceId';
  const platform = Platforms.Android;

  function getAnalyticsData(userId: number) {
    return {
      userId,
      ip,
      appsflyerDeviceId,
      platform,
    };
  }

  before(() => clean());

  beforeEach(() => {
    broadcastAdvanceTipChangedJobStub = sandbox.stub(Jobs, 'broadcastAdvanceTipChangedTask');
    return up([
      userFixture,
      institutionFixture,
      bankConnectionFixture,
      bankAccountFixture,
      paymentMethodFixture,
      advanceFixture,
    ]);
  });

  afterEach(() => clean(sandbox));

  it('should succeed if disbursement status is not cancelled', async () => {
    const advance = await factory.create<Advance>('advance', { amount: 100, outstanding: 125 });
    const advanceTipOriginal = await factory.create('advance-tip', {
      advanceId: advance.id,
      amount: 25,
      percent: 25,
    });

    await setTipPercent(advance, 50, 'user');
    await advance.reload();

    const advanceTip = await AdvanceTip.findOne({
      where: {
        advanceId: advance.id,
      },
    });

    expect(advanceTipOriginal.id).to.be.equal(advanceTip.id);
    expect(advanceTip.percent).to.be.equal(50);
    expect(advanceTip.amount).to.be.equal(50);
    expect(advance.outstanding).to.be.equal(150);
    expect(broadcastAdvanceTipChangedJobStub).to.be.calledOnce;
  });

  it('should broadcast tip revenue updates', async () => {
    const advance = await factory.create('advance', { amount: 60 });
    const advanceTip = await factory.create('advance-tip', {
      advanceId: advance.id,
      amount: 0,
      percent: 0,
    });

    await setTipPercent(advance, 50, 'user', { analyticsData: getAnalyticsData(advance.userId) });
    await advanceTip.reload();
    expect(advanceTip.percent).to.equal(50);
    expect(broadcastAdvanceTipChangedJobStub).to.be.calledWithExactly({
      advanceId: advance.id,
      amount: 30,
      appsflyerDeviceId,
      ip,
      platform,
      userId: advance.userId,
    });
  });

  it('it should broadcast negative amount if decreasing tip', async () => {
    const advance = await factory.create('advance', { amount: 60 });
    await factory.create('advance-tip', {
      advanceId: advance.id,
      amount: 0,
      percent: 0,
    });

    await setTipPercent(advance, 50, 'user', { analyticsData: getAnalyticsData(advance.userId) });

    expect(broadcastAdvanceTipChangedJobStub).to.be.calledWithExactly({
      advanceId: advance.id,
      amount: 30,
      appsflyerDeviceId,
      ip,
      platform,
      userId: advance.userId,
    });

    await advance.reload();

    await setTipPercent(advance, 25, 'user', { analyticsData: getAnalyticsData(advance.userId) });

    expect(broadcastAdvanceTipChangedJobStub).to.be.calledWithExactly({
      advanceId: advance.id,
      amount: -15,
      appsflyerDeviceId,
      ip,
      platform,
      userId: advance.userId,
    });
  });

  it('should fail to update tip percent if disbursement status is cancelled', async () => {
    const id = 2400;

    const advance = await Advance.findByPk(id);

    await setTipPercent(advance, 10, 'user');

    const [advanceTip] = await Promise.all([
      AdvanceTip.findOne({ where: { advanceId: advance.id } }),
      advance.reload(),
    ]);

    expect(advance.userId).to.equal(id);
    expect(advance.disbursementStatus).to.equal(ExternalTransactionStatus.Canceled);
    expect(advanceTip.percent).to.equal(0);
    expect(broadcastAdvanceTipChangedJobStub).to.not.be.called;
  });
});
