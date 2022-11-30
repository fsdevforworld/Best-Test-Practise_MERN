import { expect } from 'chai';
import { moment } from '@dave-inc/time-lib';
import * as sinon from 'sinon';
import factory from '../factories';
import pubsub from '../../src/lib/pubsub';
import { publishAdvancesForCollection } from '../../src/publishers/publish-collect-advance/task';
import { AdvanceCollectionSchedule, BankConnection } from '../../src/models';
import { BankingDataSource } from '@dave-inc/wire-typings';
import { clean, setUpRefreshBalanceAndCollectData, stubLoomisClient } from '../test-helpers';
import { COMPLIANCE_EXEMPT_TRIGGERS } from '../../src/domain/advance-collection-engine/rules';
import { collectAdvanceDailyAutoRetrieveEvent } from '../../src/domain/event';

const BASE_TOPIC_NAME = 'collect-advance';

describe('Publish Collect Advance Task', () => {
  const sandbox = sinon.createSandbox();

  beforeEach(() => stubLoomisClient(sandbox));

  afterEach(() => clean(sandbox));

  function setupScenario() {
    const publishedIds: number[] = [];

    sandbox
      .stub(collectAdvanceDailyAutoRetrieveEvent, 'publish')
      .callsFake(({ advanceId }: { advanceId: number }) => {
        publishedIds.push(advanceId);
      });

    return { publishedIds };
  }

  it('should publish collectible advances to the specified topic', async () => {
    // hackTime();
    // mockExperimentCheck();
    const advances = await Promise.all([
      setUpRefreshBalanceAndCollectData(),
      setUpRefreshBalanceAndCollectData(),
      setUpRefreshBalanceAndCollectData(),
    ]);
    const pubsubPublishStub = sandbox.stub(pubsub, 'publish').resolves();
    await publishAdvancesForCollection();
    for (const advance of advances) {
      /**
       * our pubsub client class receives the base topic name
       * in the 'publish' method and adds the environment-
       * specific prefix before calling pubsub itself
       */
      sinon.assert.calledWith(pubsubPublishStub, BASE_TOPIC_NAME, { advanceId: advance.id });
    }
  });

  it('due today', async () => {
    const { publishedIds } = setupScenario();
    const [advance, advance2, advance3] = await Promise.all([
      setUpRefreshBalanceAndCollectData(),
      setUpRefreshBalanceAndCollectData(),
      setUpRefreshBalanceAndCollectData(),
    ]);
    await publishAdvancesForCollection();

    expect(publishedIds).to.include(advance.id);
    expect(publishedIds).to.include(advance2.id);
    expect(publishedIds).to.include(advance3.id);
    expect(publishedIds.length).to.eq(3);
  });

  it('due yesterday', async () => {
    const { publishedIds } = setupScenario();
    const advance = await setUpRefreshBalanceAndCollectData({
      bankingDataSource: BankingDataSource.Plaid,
      paybackDate: moment().subtract(1, 'day'),
    });

    await publishAdvancesForCollection();

    expect(publishedIds).to.include(advance.id);
    expect(publishedIds.length).to.eq(1);
  });

  it('excludes not outstanding', async () => {
    const { publishedIds } = setupScenario();
    const advance = await setUpRefreshBalanceAndCollectData({
      bankingDataSource: BankingDataSource.Plaid,
      paybackDate: moment().subtract(1, 'day'),
    });

    await advance.update({ outstanding: 0 });
    await publishAdvancesForCollection();

    expect(publishedIds).to.not.include(advance.id);
    expect(publishedIds.length).to.eq(0);
  });

  it('excludes disbursement is pending', async () => {
    const { publishedIds } = setupScenario();
    const advance = await setUpRefreshBalanceAndCollectData({
      bankingDataSource: BankingDataSource.Plaid,
      paybackDate: moment().subtract(1, 'day'),
    });
    await advance.update({ disbursementStatus: 'PENDING' });

    await publishAdvancesForCollection();

    expect(publishedIds).to.not.include(advance.id);
    expect(publishedIds.length).to.eq(0);
  });

  it('does not exclude advances with three advance collections and one from an exempt collection trigger', async () => {
    const { publishedIds } = setupScenario();
    const advance = await setUpRefreshBalanceAndCollectData();

    const [payment1, payment2, payment3, payment4] = await Promise.all([
      factory.create('payment', { advanceId: advance.id, status: 'COMPLETED' }),
      factory.create('payment', { advanceId: advance.id, status: 'COMPLETED' }),
      factory.create('payment', { advanceId: advance.id, status: 'PENDING' }),
      factory.create('payment', { advanceId: advance.id, status: 'COMPLETED' }),
    ]);

    await Promise.all([
      factory.create('advance-collection-attempt', {
        advanceId: advance.id,
        paymentId: payment1.id,
        processing: null,
        trigger: COMPLIANCE_EXEMPT_TRIGGERS[0],
      }),
      factory.create('advance-collection-attempt', {
        advanceId: advance.id,
        paymentId: payment2.id,
        processing: null,
        trigger: 'daily-cronjob',
      }),
      factory.create('advance-collection-attempt', {
        advanceId: advance.id,
        paymentId: payment3.id,
        processing: null,
        trigger: 'daily-cronjob',
      }),
      factory.create('advance-collection-attempt', {
        advanceId: advance.id,
        paymentId: payment4.id,
        processing: null,
        trigger: 'daily-cronjob',
      }),
    ]);

    await publishAdvancesForCollection();

    expect(publishedIds).to.include(advance.id);
    expect(publishedIds.length).to.eq(1);
  });

  it('excludes advances with four or more successful collection attempts', async () => {
    const { publishedIds } = setupScenario();
    const advance = await setUpRefreshBalanceAndCollectData();

    const [payment1, payment2, payment3, payment4] = await Promise.all([
      factory.create('payment', { advanceId: advance.id, status: 'COMPLETED' }),
      factory.create('payment', { advanceId: advance.id, status: 'COMPLETED' }),
      factory.create('payment', { advanceId: advance.id, status: 'PENDING' }),
      factory.create('payment', { advanceId: advance.id, status: 'COMPLETED' }),
    ]);

    await Promise.all([
      factory.create('advance-collection-attempt', {
        advanceId: advance.id,
        paymentId: payment1.id,
        processing: null,
        trigger: 'daily-cronjob',
      }),
      factory.create('advance-collection-attempt', {
        advanceId: advance.id,
        paymentId: payment2.id,
        processing: null,
        trigger: 'daily-cronjob',
      }),
      factory.create('advance-collection-attempt', {
        advanceId: advance.id,
        paymentId: payment3.id,
        processing: null,
        trigger: 'daily-cronjob',
      }),
      factory.create('advance-collection-attempt', {
        advanceId: advance.id,
        paymentId: payment4.id,
        processing: null,
        trigger: 'daily-cronjob',
      }),
    ]);

    await publishAdvancesForCollection();

    expect(publishedIds).to.not.include(advance.id);
    expect(publishedIds.length).to.eq(0);
  });

  it('includes advances with three or fewer successful collection attempts', async () => {
    const { publishedIds } = setupScenario();
    const advance = await setUpRefreshBalanceAndCollectData();

    await Promise.all([
      factory.create('payment', { advanceId: advance.id, status: 'COMPLETED' }),
      factory.create('payment', { advanceId: advance.id, status: 'PENDING' }),
      factory.create('payment', { advanceId: advance.id, status: 'COMPLETED' }),
    ]);

    await publishAdvancesForCollection();

    expect(publishedIds).to.include(advance.id);
    expect(publishedIds.length).to.eq(1);
  });

  it('INCLUDES advances with associated collection schedules because the experiment is over', async () => {
    const { publishedIds } = setupScenario();
    const advance = await setUpRefreshBalanceAndCollectData();
    await factory.createMany<AdvanceCollectionSchedule>('advance-collection-schedule', 4, {
      advanceId: advance.id,
    });

    await publishAdvancesForCollection();

    expect(publishedIds).to.include(advance.id);
    expect(publishedIds.length).to.be.greaterThan(0);
  });

  it('includes invalid bank connection credentials', async () => {
    const { publishedIds } = setupScenario();
    const advance = await setUpRefreshBalanceAndCollectData({
      bankingDataSource: BankingDataSource.Plaid,
      paybackDate: moment().subtract(1, 'day'),
    });
    await BankConnection.update({ hasValidCredentials: false }, { where: { id: 4 } });

    await publishAdvancesForCollection();

    expect(publishedIds).to.include(advance.id);
    expect(publishedIds.length).to.eq(1);
  });

  it('excludes not due today or yesterday if not publishAdvancesForCollectionning on Monday', async () => {
    const isMonday = moment().day() === 1;

    const { publishedIds } = setupScenario();
    const [
      advance1,
      advance2,
      advance3,
      advance4,
      twoDayOverDueADvance,
      threeDayOverDueAdvance,
    ] = await Promise.all([
      setUpRefreshBalanceAndCollectData({
        bankingDataSource: BankingDataSource.Plaid,
        paybackDate: moment().subtract(1, 'year'),
      }),
      setUpRefreshBalanceAndCollectData({
        bankingDataSource: BankingDataSource.Plaid,
        paybackDate: moment().subtract(1, 'month'),
      }),
      setUpRefreshBalanceAndCollectData({
        bankingDataSource: BankingDataSource.Plaid,
        paybackDate: moment().add(1, 'month'),
      }),
      setUpRefreshBalanceAndCollectData({
        bankingDataSource: BankingDataSource.Plaid,
        paybackDate: moment().add(1, 'day'),
      }),
      setUpRefreshBalanceAndCollectData({
        bankingDataSource: BankingDataSource.Plaid,
        paybackDate: moment().subtract(2, 'days'),
      }),
      setUpRefreshBalanceAndCollectData({
        bankingDataSource: BankingDataSource.Plaid,
        paybackDate: moment().subtract(3, 'days'),
      }),
    ]);

    await publishAdvancesForCollection();

    expect(publishedIds).to.not.include(advance1.id);
    expect(publishedIds).to.not.include(advance2.id);
    expect(publishedIds).to.not.include(advance3.id);
    expect(publishedIds).to.not.include(advance4.id);
    if (!isMonday) {
      expect(publishedIds).to.not.include(twoDayOverDueADvance.id);
      expect(publishedIds).to.not.include(threeDayOverDueAdvance.id);
      expect(publishedIds.length).to.eq(0);
    }
  });

  it.skip('includes Friday advances if publishAdvancesForCollectionning on Monday', async () => {
    const isMonday = moment().day() === 1;

    if (!isMonday) {
      return;
    }

    const { publishedIds } = setupScenario();
    const [fourDaveOverDueAdvance, notDueAdvance, fridayAdvance] = await Promise.all([
      setUpRefreshBalanceAndCollectData({
        bankingDataSource: BankingDataSource.Plaid,
        paybackDate: moment().subtract(4, 'days'),
      }),
      setUpRefreshBalanceAndCollectData({
        bankingDataSource: BankingDataSource.Plaid,
        paybackDate: moment().add(1, 'day'),
      }),
      setUpRefreshBalanceAndCollectData({
        bankingDataSource: BankingDataSource.Plaid,
        paybackDate: moment('2020-04-03'),
      }),
    ]);

    await publishAdvancesForCollection();

    expect(publishedIds).to.not.include(fourDaveOverDueAdvance.id);
    expect(publishedIds).to.not.include(notDueAdvance.id);
    expect(publishedIds).to.include(fridayAdvance.id);
    expect(publishedIds.length).to.eq(1);
  });

  it('filters based on the min advance amount', async () => {
    const { publishedIds } = setupScenario();
    const advance = await setUpRefreshBalanceAndCollectData({
      bankingDataSource: BankingDataSource.Plaid,
      paybackDate: moment().subtract(1, 'day'),
      amount: 5,
    });

    await publishAdvancesForCollection({ minAdvanceAmount: 25 });

    expect(publishedIds).to.not.include(advance.id);
    expect(publishedIds.length).to.eq(0);
  });

  it('optionally allows a min date', async () => {
    const { publishedIds } = setupScenario();
    const advance = await setUpRefreshBalanceAndCollectData({
      bankingDataSource: BankingDataSource.Plaid,
      paybackDate: moment().subtract(4, 'days'),
    });

    await publishAdvancesForCollection({ minDate: moment().subtract(4, 'days') });

    expect(publishedIds).to.include(advance.id);
    expect(publishedIds.length).to.eq(1);
  });

  it('optionally allows a max date', async () => {
    const { publishedIds } = setupScenario();
    const advance = await setUpRefreshBalanceAndCollectData({
      bankingDataSource: BankingDataSource.Plaid,
      paybackDate: moment(),
    });

    await publishAdvancesForCollection({ maxDate: moment().subtract(1, 'days') });

    expect(publishedIds).to.not.include(advance.id);
    expect(publishedIds.length).to.eq(0);
  });
});
