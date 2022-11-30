import * as sinon from 'sinon';
import { expect } from 'chai';

import { ForecastJsonResponse } from '@dave-inc/wire-typings';

import amplitude from '../../../src/lib/amplitude';
import braze from '../../../src/lib/braze';
import sendgrid from '../../../src/lib/sendgrid';
import twilio from '../../../src/lib/twilio';

import { BankTransaction as BankTransactionModel, MerchantInfo } from '../../../src/models';

import * as BankingDataSync from '../../../src/domain/banking-data-sync';
import * as NotificationDomain from '../../../src/domain/notifications';

import { AnalyticsEvent, AnalyticsUserProperty } from '../../../src/typings';

import {
  alertFixture,
  bankAccountFixture,
  bankConnectionFixture,
  institutionFixture,
  userFixture,
} from '../../fixtures';
import factory from '../../factories';

import { clean, stubBankTransactionClient, up } from '../../test-helpers';

describe('Forecast Notifications', () => {
  const sandbox = sinon.createSandbox();

  let twilioStub: sinon.SinonStub;

  before(() => clean());

  // insert institution fixtures
  beforeEach(() => {
    twilioStub = sandbox.stub(twilio, 'send').resolves();
    sandbox.stub(sendgrid, 'send').resolves();
    sandbox.stub(BankingDataSync, 'fetchAndSyncBankTransactions').resolves();
    stubBankTransactionClient(sandbox);
    return up([
      userFixture,
      institutionFixture,
      bankConnectionFixture,
      bankAccountFixture,
      alertFixture,
    ]);
  });

  afterEach(() => clean(sandbox));

  it('should not send an alert if the user has no previous forecasts', async () => {
    const brazeTrackSpy = sandbox.spy(braze, 'track');
    const amplitudeTrackSpy = sandbox.spy(amplitude, 'track');

    const forecast = { bankAccountId: 400 } as ForecastJsonResponse;
    const result = await NotificationDomain.sendForecastAlerts(forecast, null);

    expect(result).to.equal(false);
    expect(brazeTrackSpy.callCount).to.equal(0);
    expect(amplitudeTrackSpy.callCount).to.equal(0);
  });

  it('should emit braze and amplitude events if the user has overdrafted', async () => {
    const brazeTrackSpy = sandbox.spy(braze, 'track');
    const amplitudeTrackSpy = sandbox.spy(amplitude, 'track');

    const prevForecast = {
      userId: 400,
      bankAccountId: 401,
      startBalance: 1000,
    } as ForecastJsonResponse;
    const forecast = {
      userId: 400,
      bankAccountId: 401,
      startBalance: -10,
      pending: [],
    } as ForecastJsonResponse;
    const merchantInfo = await factory.create<MerchantInfo>('merchant-info');
    const lastTransaction = await factory.create<BankTransactionModel>('bank-transaction', {
      amount: -20,
      bankAccountId: 401,
      merchantInfoId: merchantInfo.id,
      userId: 400,
      pending: false,
    });

    const result = await NotificationDomain.sendForecastAlerts(forecast, prevForecast);

    expect(result).to.equal(true);

    expect(twilioStub).to.have.callCount(0);

    expect(brazeTrackSpy).to.have.callCount(1);
    expect(amplitudeTrackSpy).to.have.callCount(1);

    const brazeEvent = brazeTrackSpy.firstCall.args[0].events[0];
    expect(brazeEvent.name).to.equal(AnalyticsEvent.BankAccountOverdrawn);
    expect(brazeEvent.properties[AnalyticsUserProperty.UserId]).to.equal(forecast.userId);
    expect(brazeEvent.properties[AnalyticsUserProperty.LastTransactionAmount]).to.equal(
      lastTransaction.amount,
    );
    expect(brazeEvent.properties[AnalyticsUserProperty.LastTransactionMerchantName]).to.equal(
      merchantInfo.displayName,
    );

    const amplitudeEvent = amplitudeTrackSpy.firstCall.args[0];
    expect(amplitudeEvent.eventType).to.equal(AnalyticsEvent.BankAccountOverdrawn);
    expect(amplitudeEvent.eventProperties).to.deep.equal(brazeEvent.properties);
  });

  it('should emit braze and amplitude events if the user might overdraft (pending)', async () => {
    const brazeTrackSpy = sandbox.spy(braze, 'track');
    const amplitudeTrackSpy = sandbox.spy(amplitude, 'track');

    const prevForecast = {
      userId: 400,
      bankAccountId: 402,
      lowestBalance: 1000,
    } as ForecastJsonResponse;
    const forecast = {
      userId: 400,
      bankAccountId: 402,
      startBalance: 10,
      pending: [{ amount: -100 }],
    } as ForecastJsonResponse;
    const merchantInfo = await factory.create<MerchantInfo>('merchant-info');
    const lastPendingTransaction = await factory.create<BankTransactionModel>('bank-transaction', {
      amount: -20,
      bankAccountId: 402,
      merchantInfoId: merchantInfo.id,
      userId: 400,
      pending: true,
    });

    const result = await NotificationDomain.sendForecastAlerts(forecast, prevForecast);

    expect(result).to.equal(true);

    expect(twilioStub).to.have.callCount(0);

    expect(brazeTrackSpy).to.have.callCount(1);
    expect(amplitudeTrackSpy).to.have.callCount(1);

    const brazeEvent = brazeTrackSpy.firstCall.args[0].events[0];
    expect(brazeEvent.name).to.equal(AnalyticsEvent.BankAccountOverdraftPending);
    expect(brazeEvent.properties[AnalyticsUserProperty.UserId]).to.equal(forecast.userId);
    expect(brazeEvent.properties[AnalyticsUserProperty.LastPendingTransactionAmount]).to.equal(
      lastPendingTransaction.amount,
    );
    expect(
      brazeEvent.properties[AnalyticsUserProperty.LastPendingTransactionMerchantName],
    ).to.equal(merchantInfo.displayName);

    const amplitudeEvent = amplitudeTrackSpy.firstCall.args[0];
    expect(amplitudeEvent.eventType).to.equal(AnalyticsEvent.BankAccountOverdraftPending);
    expect(amplitudeEvent.eventProperties).to.deep.equal(brazeEvent.properties);
  });

  it('should emit braze and amplitude events if the user might overdraft (predicted)', async () => {
    const brazeTrackSpy = sandbox.spy(braze, 'track');
    const amplitudeTrackSpy = sandbox.spy(amplitude, 'track');

    const prevForecast = {
      userId: 400,
      bankAccountId: 403,
      startBalance: 1000,
      lowestBalance: 1000,
      pending: [],
    } as ForecastJsonResponse;
    const forecast = {
      userId: 400,
      bankAccountId: 403,
      startBalance: 10,
      lowestBalance: -10,
      pending: [],
    } as ForecastJsonResponse;
    const merchantInfo = await factory.create<MerchantInfo>('merchant-info');
    const lastPendingTransaction = await factory.create<BankTransactionModel>('bank-transaction', {
      amount: -20,
      bankAccountId: 403,
      merchantInfoId: merchantInfo.id,
      userId: 400,
      pending: true,
    });
    const lastCompletedTransaction = await factory.create<BankTransactionModel>(
      'bank-transaction',
      {
        amount: -20,
        bankAccountId: 403,
        merchantInfoId: merchantInfo.id,
        userId: 400,
        pending: false,
      },
    );

    const result = await NotificationDomain.sendForecastAlerts(forecast, prevForecast);

    expect(result).to.equal(true);

    expect(twilioStub).to.have.callCount(0);

    expect(brazeTrackSpy).to.have.callCount(1);
    expect(amplitudeTrackSpy).to.have.callCount(1);

    const brazeEvent = brazeTrackSpy.firstCall.args[0].events[0];
    expect(brazeEvent.name).to.equal(AnalyticsEvent.PotentialOverdraftIdentified);
    expect(brazeEvent.properties[AnalyticsUserProperty.UserId]).to.equal(forecast.userId);
    expect(brazeEvent.properties[AnalyticsUserProperty.LastPendingTransactionAmount]).to.equal(
      lastPendingTransaction.amount,
    );
    expect(
      brazeEvent.properties[AnalyticsUserProperty.LastPendingTransactionMerchantName],
    ).to.equal(merchantInfo.displayName);
    expect(brazeEvent.properties[AnalyticsUserProperty.LastTransactionAmount]).to.equal(
      lastCompletedTransaction.amount,
    );
    expect(brazeEvent.properties[AnalyticsUserProperty.LastTransactionMerchantName]).to.equal(
      merchantInfo.displayName,
    );

    const amplitudeEvent = amplitudeTrackSpy.firstCall.args[0];
    expect(amplitudeEvent.eventType).to.equal(AnalyticsEvent.PotentialOverdraftIdentified);
    expect(amplitudeEvent.eventProperties).to.deep.equal(brazeEvent.properties);
  });

  it('should emit braze and amplitude events if the user is below their notification threshold', async () => {
    const brazeTrackSpy = sandbox.spy(braze, 'track');
    const amplitudeTrackSpy = sandbox.spy(amplitude, 'track');

    const prevForecast = {
      userId: 400,
      bankAccountId: 401,
      startBalance: 200,
      pending: [],
    } as ForecastJsonResponse;
    const forecast = {
      userId: 400,
      bankAccountId: 401,
      startBalance: 10,
      lowestBalance: 2,
      pending: [],
    } as ForecastJsonResponse;
    const merchantInfo = await factory.create<MerchantInfo>('merchant-info');
    const lastTransaction = await factory.create<BankTransactionModel>('bank-transaction', {
      amount: -20,
      bankAccountId: 401,
      merchantInfoId: merchantInfo.id,
      userId: 400,
      pending: false,
    });

    const result = await NotificationDomain.sendForecastAlerts(forecast, prevForecast);

    expect(result).to.equal(true);

    expect(twilioStub).to.have.callCount(0);

    expect(brazeTrackSpy).to.have.callCount(1);
    expect(amplitudeTrackSpy).to.have.callCount(1);

    const brazeEvent = brazeTrackSpy.firstCall.args[0].events[0];
    expect(brazeEvent.name).to.equal(AnalyticsEvent.SafetyNetBreached);
    expect(brazeEvent.properties[AnalyticsUserProperty.UserId]).to.equal(forecast.userId);
    expect(brazeEvent.properties[AnalyticsUserProperty.LastTransactionAmount]).to.equal(
      lastTransaction.amount,
    );
    expect(brazeEvent.properties[AnalyticsUserProperty.LastTransactionMerchantName]).to.equal(
      merchantInfo.displayName,
    );
    expect(brazeEvent.properties[AnalyticsUserProperty.LowestBalanceUntilPayday]).to.equal(
      forecast.lowestBalance,
    );

    const amplitudeEvent = amplitudeTrackSpy.firstCall.args[0];
    expect(amplitudeEvent.eventType).to.equal(AnalyticsEvent.SafetyNetBreached);
    expect(amplitudeEvent.eventProperties).to.deep.equal(brazeEvent.properties);
  });

  it('should not send an alert if the user has overdrafted but that has not changed', async () => {
    const brazeSpy = sandbox.spy(braze, 'track');
    const amplitudeSpy = sandbox.spy(amplitude, 'track');

    const forecast = {
      userId: 400,
      bankAccountId: 404,
      startBalance: -10,
      pending: [],
    } as ForecastJsonResponse;
    const result = await NotificationDomain.sendForecastAlerts(forecast, forecast);

    expect(result).to.equal(false);
    expect(brazeSpy).to.have.callCount(0);
    expect(amplitudeSpy).to.have.callCount(0);
  });

  it('should not send an alert if the user might overdraft (pending) but that has not changed', async () => {
    const brazeSpy = sandbox.spy(braze, 'track');
    const amplitudeSpy = sandbox.spy(amplitude, 'track');

    const forecast = {
      userId: 400,
      bankAccountId: 405,
      startBalance: 10,
      pending: [{ amount: -100 }],
    } as ForecastJsonResponse;
    const result = await NotificationDomain.sendForecastAlerts(forecast, forecast);
    expect(result).to.equal(false);
    expect(brazeSpy).to.have.callCount(0);
    expect(amplitudeSpy).to.have.callCount(0);
  });

  it('should not send an alert if the user might overdraft (predicted) but that has not changed', async () => {
    const brazeSpy = sandbox.spy(braze, 'track');
    const amplitudeSpy = sandbox.spy(amplitude, 'track');
    const forecast = {
      userId: 400,
      bankAccountId: 406,
      startBalance: 10,
      lowestBalance: -10,
      pending: [],
    } as ForecastJsonResponse;
    const result = await NotificationDomain.sendForecastAlerts(forecast, forecast);
    expect(result).to.equal(false);
    expect(brazeSpy).to.have.callCount(0);
    expect(amplitudeSpy).to.have.callCount(0);
  });

  it('should not send an alert if the user has reached their notification threshold but that has not changed', async () => {
    const brazeSpy = sandbox.spy(braze, 'track');
    const amplitudeSpy = sandbox.spy(amplitude, 'track');
    const forecast = {
      userId: 400,
      bankAccountId: 404,
      startBalance: 10,
      pending: [],
    } as ForecastJsonResponse;
    const result = await NotificationDomain.sendForecastAlerts(forecast, forecast);
    expect(result).to.equal(false);
    expect(brazeSpy).to.have.callCount(0);
    expect(amplitudeSpy).to.have.callCount(0);
  });

  it('should not send an alert if the user has overdrafted but already knows', async () => {
    const brazeTrackSpy = sandbox.spy(braze, 'track');
    const amplitudeSpy = sandbox.spy(amplitude, 'track');
    const prevForecast = {
      userId: 400,
      bankAccountId: 407,
      startBalance: 100,
      pending: [],
    } as ForecastJsonResponse;
    const forecast = {
      userId: 400,
      bankAccountId: 407,
      startBalance: -10,
      pending: [],
    } as ForecastJsonResponse;
    const result = await NotificationDomain.sendForecastAlerts(forecast, prevForecast);
    expect(result).to.equal(true);
    expect(twilioStub).to.have.callCount(0);
    expect(brazeTrackSpy).to.have.callCount(1);
    expect(amplitudeSpy).to.have.callCount(1);
  });

  it('should not send an alert if the user might overdraft (pending) but already knows', async () => {
    const brazeSpy = sandbox.spy(braze, 'track');
    const amplitudeSpy = sandbox.spy(amplitude, 'track');

    const prevForecast = {
      userId: 400,
      bankAccountId: 408,
      lowestBalance: 1000,
    } as ForecastJsonResponse;
    const forecast = {
      userId: 400,
      bankAccountId: 408,
      startBalance: 10,
      pending: [{ amount: -100 }],
    } as ForecastJsonResponse;
    const result = await NotificationDomain.sendForecastAlerts(forecast, prevForecast);
    expect(result).to.equal(true);
    expect(brazeSpy).to.have.callCount(1);
    expect(amplitudeSpy).to.have.callCount(1);
    expect(twilioStub).to.have.callCount(0);
  });

  it('should not send an alert if the user might overdraft (predicted) but already knows', async () => {
    const brazeSpy = sandbox.spy(braze, 'track');
    const amplitudeSpy = sandbox.spy(amplitude, 'track');

    const prevForecast = {
      userId: 400,
      bankAccountId: 409,
      startBalance: 1000,
      lowestBalance: 1000,
      pending: [],
    } as ForecastJsonResponse;
    const forecast = {
      userId: 400,
      bankAccountId: 409,
      startBalance: 10,
      lowestBalance: -10,
      pending: [],
    } as ForecastJsonResponse;

    const result = await NotificationDomain.sendForecastAlerts(forecast, prevForecast);

    expect(result).to.equal(true);
    expect(twilioStub).to.have.callCount(0);
    expect(brazeSpy).to.have.callCount(1);
    expect(amplitudeSpy).to.have.callCount(1);
  });
});
