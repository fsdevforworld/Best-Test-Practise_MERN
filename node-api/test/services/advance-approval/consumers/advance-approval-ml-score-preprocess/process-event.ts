import { BankAccountSubtype } from '@dave-inc/wire-typings';
import * as sinon from 'sinon';

import {
  buildIntegrationTestUser,
  clean,
  fakeDateTime,
  stubBalanceLogClient,
  stubLoomisClient,
} from '@test-helpers';

import { processEvent } from '../../../../../src/services/advance-approval/advance-approval-engine/consumers/advance-approval-ml-score-preprocess/process-event';

import { moment } from '@dave-inc/time-lib';
import pubsub from '../../../../../src/lib/pubsub';

import { UserAppVersion } from '../../../../../src/models';

import { EventTopic, UnderwritingMLScoreEventTrigger } from '../../../../../src/typings';

import * as advanceApprovalEngineDomain from '../../../../../src/services/advance-approval/advance-approval-engine';
import stubBankTransactionClient from '../../../../test-helpers/stub-bank-transaction-client';
import RecurringTransactionClient from '../../../../../src/services/advance-approval/recurring-transaction-client';

describe('Advance Approval Ml Score Preprocess - Process Event', () => {
  const sandbox = sinon.createSandbox();

  before(() => clean(sandbox));
  beforeEach(() => {
    stubBalanceLogClient(sandbox);
    stubBankTransactionClient(sandbox);
    stubLoomisClient(sandbox);
  });
  afterEach(() => clean(sandbox));

  it('should not publish a scoring event if bank account is not supported', async () => {
    const { bankAccount } = await buildIntegrationTestUser({
      hasLowIncome: true,
      isNewAccount: false,
      failedSolvency: false,
    });

    await bankAccount.update({ subtype: BankAccountSubtype.Savings });

    const event = {
      ack: sandbox.stub(),
      nack: sandbox.stub(),
    } as any;

    const pubsubPublishStub = sandbox.stub(pubsub, 'publish');

    const now = moment();

    fakeDateTime(sandbox, now);

    await processEvent(event, {
      bankAccountId: bankAccount.id,
      trigger: UnderwritingMLScoreEventTrigger.PlaidUpdater,
    });

    sinon.assert.notCalled(pubsubPublishStub);
    sinon.assert.calledOnce(event.ack);
  });

  it('should not publish a scoring event if user has not been active in last 3 months', async () => {
    const { bankAccount, recurringTransaction } = await buildIntegrationTestUser({
      hasLowIncome: true,
      isNewAccount: false,
      failedSolvency: false,
    });
    sandbox.stub(RecurringTransactionClient, 'getIncomes').resolves([recurringTransaction]);

    await UserAppVersion.update(
      {
        lastSeen: moment()
          .subtract(3, 'month')
          .subtract(1, 'day'),
      },
      { where: { userId: bankAccount.userId } },
    );

    const event = {
      ack: sandbox.stub(),
      nack: sandbox.stub(),
    } as any;

    const pubsubPublishStub = sandbox.stub(pubsub, 'publish');

    const now = moment();

    fakeDateTime(sandbox, now);

    await processEvent(event, {
      bankAccountId: bankAccount.id,
      trigger: UnderwritingMLScoreEventTrigger.PlaidUpdater,
    });

    sinon.assert.notCalled(pubsubPublishStub);
    sinon.assert.calledOnce(event.ack);
  });

  it('should traverse till solvency ml node and publish scoring event', async () => {
    const { bankAccount, recurringTransaction } = await buildIntegrationTestUser({
      hasLowIncome: false,
      isNewAccount: false,
      failedSolvency: true,
    });

    const expectedDate = moment()
      .add(3, 'day')
      .ymd();

    sandbox.stub(RecurringTransactionClient, 'getIncomes').resolves([recurringTransaction]);
    sandbox.stub(RecurringTransactionClient, 'getNextExpectedTransaction').resolves({
      expectedDate,
    });

    await UserAppVersion.update(
      {
        lastSeen: moment().subtract(2, 'month'),
      },
      { where: { userId: bankAccount.userId } },
    );

    const event = {
      ack: sandbox.stub(),
      nack: sandbox.stub(),
    } as any;

    const pubsubPublishStub = sandbox.stub(pubsub, 'publish');

    const now = moment();

    fakeDateTime(sandbox, now);

    await processEvent(event, {
      bankAccountId: bankAccount.id,
      trigger: UnderwritingMLScoreEventTrigger.PlaidUpdater,
    });

    sinon.assert.calledOnce(pubsubPublishStub);
    sinon.assert.calledWith(pubsubPublishStub, EventTopic.UnderwritingMLScore, {
      user_id: bankAccount.userId,
      bank_account_id: bankAccount.id,
      request_date: now.format('YYYY-MM-DD'),
      payback_date: expectedDate,
      trigger: UnderwritingMLScoreEventTrigger.PlaidUpdater,
    });
    sinon.assert.calledOnce(event.ack);
  });

  it('should traverse till tiny money ml node and publish scoring event', async () => {
    const { bankAccount, recurringTransaction } = await buildIntegrationTestUser({
      hasLowIncome: true,
      isNewAccount: false,
      failedSolvency: false,
    });

    const expectedDate = moment()
      .add(3, 'day')
      .ymd();

    sandbox.stub(RecurringTransactionClient, 'getIncomes').resolves([recurringTransaction]);
    sandbox.stub(RecurringTransactionClient, 'getNextExpectedTransaction').resolves({
      expectedDate,
    });

    await UserAppVersion.update(
      {
        lastSeen: moment().subtract(1, 'month'),
      },
      { where: { userId: bankAccount.userId } },
    );

    const event = {
      ack: sandbox.stub(),
      nack: sandbox.stub(),
    } as any;

    const pubsubPublishStub = sandbox.stub(pubsub, 'publish');

    const now = moment();

    fakeDateTime(sandbox, now);

    await processEvent(event, {
      bankAccountId: bankAccount.id,
      trigger: UnderwritingMLScoreEventTrigger.PlaidUpdater,
    });

    sinon.assert.calledOnce(pubsubPublishStub);
    sinon.assert.calledWith(pubsubPublishStub, EventTopic.UnderwritingMLScore, {
      user_id: bankAccount.userId,
      bank_account_id: bankAccount.id,
      request_date: now.format('YYYY-MM-DD'),
      payback_date: expectedDate,
      trigger: UnderwritingMLScoreEventTrigger.PlaidUpdater,
    });
    sinon.assert.calledOnce(event.ack);
  });

  it('should traverse till tiny money ml node and publish scoring event when there are no recurring transactions', async () => {
    const { bankAccount, recurringTransaction } = await buildIntegrationTestUser({
      hasLowIncome: true,
      isNewAccount: false,
      failedSolvency: false,
    });

    await recurringTransaction.destroy();

    sandbox.stub(RecurringTransactionClient, 'getIncomes').resolves([]);

    await UserAppVersion.update(
      {
        lastSeen: moment().subtract(2, 'week'),
      },
      { where: { userId: bankAccount.userId } },
    );

    const event = {
      ack: sandbox.stub(),
      nack: sandbox.stub(),
    } as any;

    const pubsubPublishStub = sandbox.stub(pubsub, 'publish');

    const now = moment();

    fakeDateTime(sandbox, now);

    await processEvent(event, {
      bankAccountId: bankAccount.id,
      trigger: UnderwritingMLScoreEventTrigger.PlaidUpdater,
    });

    sinon.assert.calledOnce(pubsubPublishStub);
    sinon.assert.calledWith(pubsubPublishStub, EventTopic.UnderwritingMLScore, {
      user_id: bankAccount.userId,
      bank_account_id: bankAccount.id,
      request_date: now.format('YYYY-MM-DD'),
      payback_date: advanceApprovalEngineDomain
        .getExpectedDateForNoIncome(now)
        .format('YYYY-MM-DD'),
      trigger: UnderwritingMLScoreEventTrigger.PlaidUpdater,
    });
    sinon.assert.calledOnce(event.ack);
  });
});
