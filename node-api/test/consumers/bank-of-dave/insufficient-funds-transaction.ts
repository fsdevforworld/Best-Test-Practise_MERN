import { expect } from 'chai';
import * as sinon from 'sinon';
import {
  DogstatsdMessages,
  handleMessage,
} from '../../../src/consumers/bank-of-dave/insufficient-funds-transaction/consumer';
import * as BankingDataSync from '../../../src/domain/banking-data-sync';
import amplitude from '../../../src/lib/amplitude';
import braze from '../../../src/lib/braze';
import { dogstatsd } from '../../../src/lib/datadog-statsd';
import { BankAccount } from '../../../src/models';
import { AnalyticsEvent } from '../../../src/typings';
import factory from '../../factories';
import { clean, stubBankTransactionClient } from '../../test-helpers';
import AdvanceApprovalClient from '../../../src/lib/advance-approval-client';

describe('Consume DaveBanking Insufficient Funds Transaction', () => {
  const sandbox = sinon.createSandbox();

  describe('handleMessage', () => {
    let dogstatsdIncrementStub: sinon.SinonStub;

    before(() => clean());

    beforeEach(() => {
      sandbox.stub(BankingDataSync, 'fetchAndSyncBankTransactions').resolves();
      dogstatsdIncrementStub = sandbox.stub(dogstatsd, 'increment').returns(null);
      stubBankTransactionClient(sandbox);
    });

    afterEach(() => clean(sandbox));

    it("should throw a NotFoundError if the bank account can't be found", async () => {
      const { account, message, transaction } = await getMessage({ accountUuid: 'ZipidyDooMaha' });

      await handleMessage(message, { account, transaction });

      expect(dogstatsdIncrementStub).to.have.callCount(2);
      expect(dogstatsdIncrementStub.firstCall).to.be.calledWith(
        DogstatsdMessages.BankAccountNotFound,
      );
      expect(dogstatsdIncrementStub.secondCall).to.be.calledWith(
        DogstatsdMessages.HandleMessageError,
      );
    });

    it('should send a notification if the user is not approved for an advance', async () => {
      const bankAccount: BankAccount = await factory.create('checking-account');
      const { account, message, transaction } = await getMessage({
        accountUuid: bankAccount.externalId,
        transactionAmount: 75.01,
      });

      sandbox
        .stub(AdvanceApprovalClient, 'createAdvanceApproval')
        .resolves([await factory.build('create-approval-failure')]);
      const amplitudeTrackStub = sandbox.stub(amplitude, 'track');
      const brazeTrackStub = sandbox.stub(braze, 'track');

      await handleMessage(message, { account, transaction });

      expect(dogstatsdIncrementStub).to.have.callCount(5);
      expect(dogstatsdIncrementStub.secondCall).to.be.calledWith(
        DogstatsdMessages.AdvanceNotApproved,
      );
      expect(dogstatsdIncrementStub.lastCall).to.be.calledWith(
        DogstatsdMessages.HandleMessageSuccess,
      );
      expect(amplitudeTrackStub.called).to.equal(true);
      expect(amplitudeTrackStub.firstCall.args[0].eventType).to.equal(
        AnalyticsEvent.DebitCardWithInsufficientFundsDenied,
      );
      const { eventProperties } = amplitudeTrackStub.firstCall.args[0];
      expect(eventProperties.advanceApproved).to.equal(false);
      expect(eventProperties.advanceEnablesPurchase).to.equal(false);
      expect(eventProperties.advanceApprovedAmount).to.equal(0);
      expect(eventProperties.transactionAmount).to.equal(75.01);
      expect(eventProperties.transactionMerchantName).to.equal('Bert');
      expect(brazeTrackStub.called).to.equal(true);
    });

    it('should not send a notification if the transaction has already had events sent for it', async () => {
      const bankAccount: BankAccount = await factory.create('checking-account');
      const { account, message, transaction } = await getMessage({
        accountUuid: bankAccount.externalId,
      });

      sandbox
        .stub(AdvanceApprovalClient, 'createAdvanceApproval')
        .resolves([await factory.build('create-approval-failure')]);
      const amplitudeTrackStub = sandbox.stub(amplitude, 'track');
      const brazeTrackStub = sandbox.stub(braze, 'track');

      await handleMessage(message, { account, transaction });
      await handleMessage(message, { account, transaction });

      expect(dogstatsdIncrementStub).to.have.callCount(7);

      expect(dogstatsdIncrementStub.secondCall).to.be.calledWith(
        DogstatsdMessages.AdvanceNotApproved,
      );
      expect(dogstatsdIncrementStub.calledOnceWith(DogstatsdMessages.DuplicateTransactionReceived));
      expect(amplitudeTrackStub.callCount).to.equal(1);
      expect(brazeTrackStub.callCount).to.equal(1);
    });

    it('should send a notification if the user is approved for an advance that exceeds a purchase amount', async () => {
      const bankAccount: BankAccount = await factory.create('checking-account');
      const { account, message, transaction } = await getMessage({
        accountUuid: bankAccount.externalId,
        transactionAmount: 75,
      });

      sandbox
        .stub(AdvanceApprovalClient, 'createAdvanceApproval')
        .resolves([await factory.build('create-approval-success')]);
      const amplitudeTrackStub = sandbox.stub(amplitude, 'track');
      const brazeTrackStub = sandbox.stub(braze, 'track');

      await handleMessage(message, { account, transaction });

      expect(dogstatsdIncrementStub).to.have.callCount(5);
      expect(dogstatsdIncrementStub.secondCall).to.be.calledWith(
        DogstatsdMessages.AdvanceApproved,
        ['enables_purchase:true'],
      );
      expect(dogstatsdIncrementStub.lastCall).to.be.calledWith(
        DogstatsdMessages.HandleMessageSuccess,
      );
      expect(amplitudeTrackStub.called).to.equal(true);
      expect(amplitudeTrackStub.firstCall.args[0].eventType).to.equal(
        AnalyticsEvent.DebitCardWithInsufficientFundsDenied,
      );
      const { eventProperties } = amplitudeTrackStub.firstCall.args[0];
      expect(eventProperties.advanceApproved).to.equal(true);
      expect(eventProperties.advanceEnablesPurchase).to.equal(true);
      expect(eventProperties.advanceApprovedAmount).to.equal(75);
      expect(eventProperties.transactionAmount).to.equal(75);
      expect(eventProperties.transactionMerchantName).to.equal('Bert');
      expect(brazeTrackStub.called).to.equal(true);
    });

    it("should send a notification if the user is approved for an advance that doesn't reach a purchase amount", async () => {
      const bankAccount: BankAccount = await factory.create('checking-account');
      const { account, message, transaction } = await getMessage({
        accountUuid: bankAccount.externalId,
        transactionAmount: 75.01,
      });

      sandbox
        .stub(AdvanceApprovalClient, 'createAdvanceApproval')
        .resolves([await factory.build('create-approval-success')]);
      const amplitudeTrackStub = sandbox.stub(amplitude, 'track');
      const brazeTrackStub = sandbox.stub(braze, 'track');

      await handleMessage(message, { account, transaction });

      expect(dogstatsdIncrementStub).to.have.callCount(5);
      expect(dogstatsdIncrementStub.secondCall).to.be.calledWith(
        DogstatsdMessages.AdvanceApproved,
        ['enables_purchase:false'],
      );
      expect(dogstatsdIncrementStub.lastCall).to.be.calledWith(
        DogstatsdMessages.HandleMessageSuccess,
      );
      expect(amplitudeTrackStub.called).to.equal(true);
      expect(amplitudeTrackStub.firstCall.args[0].eventType).to.equal(
        AnalyticsEvent.DebitCardWithInsufficientFundsDenied,
      );
      const { eventProperties } = amplitudeTrackStub.firstCall.args[0];
      expect(eventProperties.advanceApproved).to.equal(true);
      expect(eventProperties.advanceEnablesPurchase).to.equal(false);
      expect(eventProperties.advanceApprovedAmount).to.equal(75);
      expect(eventProperties.transactionAmount).to.equal(75.01);
      expect(eventProperties.transactionMerchantName).to.equal('Bert');
      expect(brazeTrackStub.called).to.equal(true);
    });
  });

  async function getMessage({ accountUuid, transactionAmount }: any) {
    const account = { uuid: accountUuid };

    const transaction = await factory.build('bod-transaction', {
      amount: transactionAmount,
      debit: true,
      source: {
        name: 'Bert',
        legalNames: ['Bert'],
      },
    });

    const message = await factory.build('pub-sub-event', {
      data: Buffer.from(JSON.stringify({ account, transaction })),
    });

    return { account, message, transaction };
  }
});
