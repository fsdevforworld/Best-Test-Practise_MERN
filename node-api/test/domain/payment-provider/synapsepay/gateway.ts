import { clean, replayHttp } from '../../../test-helpers';
import {
  PaymentGateway,
  PaymentProcessor,
  PaymentProviderTransactionStatus,
  PaymentProviderTransactionType,
} from '../../../../src/typings';
import { expect } from 'chai';
import redisClient from '../../../../src/lib/redis';
import SynapseGateway from '../../../../src/domain/payment-provider/synapsepay/gateway';
import { fetchTransactionDaveUserLimiter } from '../../../../src/domain/payment-provider/synapsepay/fetch-transaction-dave-user-limiter';
import Constants from '../../../../src/domain/synapsepay/constants';
import * as sinon from 'sinon';
import { helpers } from '../../../../src/domain/synapsepay';
import factory from '../../../factories';
import BankAccount from '../../../../src/models/bank-account';
import synapseNode from '../../../../src/domain/synapsepay/node';

describe('SynapseGateway', () => {
  const sandbox = sinon.createSandbox();

  beforeEach(async () =>
    Promise.all([
      redisClient.delAsync(Constants.SYNAPSEPAY_DISBURSING_USER_CACHE_KEY),
      sandbox.stub(helpers, 'getUserIP').returns('192.168.0.124'),
      sandbox.stub(fetchTransactionDaveUserLimiter, 'isRateLimited').resolves(false),
    ]),
  );

  afterEach(() => clean(sandbox));

  describe('fetchTransaction', () => {
    it(
      'retrieves a PULL',
      replayHttp('synapse-pull.json', async () => {
        const externalId = '5c392b78fe8c6b008ab6cef0';
        const transaction = await SynapseGateway.fetchTransaction({
          externalId,
          type: PaymentProviderTransactionType.AdvancePayment,
        });

        expect(transaction.externalId).to.equal(externalId);
        expect(transaction.referenceId).to.equal(null);
        expect(transaction.amount).to.equal(3.0);
        expect(transaction.processor).to.equal(PaymentProcessor.Synapsepay);
        expect(transaction.gateway).to.equal(PaymentGateway.Synapsepay);
        expect(transaction.status).to.equal(PaymentProviderTransactionStatus.Pending);
      }),
    );

    it(
      'retrieves as PUSH',
      replayHttp('synapse-push.json', async () => {
        const externalId = '5c5247c0fe8c6b0069375ae7';
        const transaction = await SynapseGateway.fetchTransaction({
          externalId,
          type: PaymentProviderTransactionType.AdvanceDisbursement,
        });

        expect(transaction.externalId).to.equal(externalId);
        expect(transaction.referenceId).to.equal(null);
        expect(transaction.amount).to.equal(6.0);
        expect(transaction.processor).to.equal(PaymentProcessor.Synapsepay);
        expect(transaction.gateway).to.equal(PaymentGateway.Synapsepay);
        expect(transaction.status).to.equal(PaymentProviderTransactionStatus.Completed);
      }),
    );

    it('checks rate limit', async () => {
      sandbox.restore();
      sandbox.stub(fetchTransactionDaveUserLimiter, 'isRateLimited').resolves(true);
      const externalId = '5c5247c0fe8c6b0069375ae7';
      const transaction = await SynapseGateway.fetchTransaction({
        externalId,
        type: PaymentProviderTransactionType.AdvanceDisbursement,
      });

      expect(transaction.externalId).to.equal(null);
      expect(transaction.referenceId).to.equal(null);
      expect(transaction.amount).to.equal(null);
      expect(transaction.processor).to.equal(PaymentProcessor.Synapsepay);
      expect(transaction.gateway).to.equal(PaymentGateway.Synapsepay);
      expect(transaction.status).to.equal(PaymentProviderTransactionStatus.RateLimit);
    });

    it(
      'retreives using a referenceId',
      replayHttp('synapse/supp-id.json', async () => {
        const referenceId = 'my-test-ref-1';

        const transaction = await SynapseGateway.fetchTransaction({
          referenceId,
          type: PaymentProviderTransactionType.AdvanceDisbursement,
        });

        expect(transaction.externalId, 'externalId').to.equal('5c773710279caa0068e63e3d');
      }),
    );

    it(
      'has a status of NOT_FOUND when there is no transaction',
      replayHttp('synapse-not-found.json', async () => {
        const externalId = 'foo-bar-baz';
        const transaction = await SynapseGateway.fetchTransaction({
          externalId,
          type: PaymentProviderTransactionType.AdvanceDisbursement,
        });

        expect(transaction.status).to.equal(PaymentProviderTransactionStatus.NotFound);
      }),
    );

    it(
      'has a status of NOT_FOUND  when there is no transaction searching by referenceId',
      replayHttp('synapse/supp-id-not-found.json', async () => {
        const referenceId = 'foo-bar-baz';
        const transaction = await SynapseGateway.fetchTransaction({
          referenceId,
          type: PaymentProviderTransactionType.AdvanceDisbursement,
        });

        expect(transaction.status).to.equal(PaymentProviderTransactionStatus.NotFound);
      }),
    );

    it(
      'handles CANCELED transactions correctly',
      replayHttp('synapse-canceled.json', async () => {
        const externalId = '5c61ba47f41098006873ea2c';
        const transaction = await SynapseGateway.fetchTransaction({
          externalId,
          type: PaymentProviderTransactionType.AdvanceDisbursement,
        });

        expect(transaction.status).to.equal(PaymentProviderTransactionStatus.Canceled);
        expect(transaction.outcome.code).to.equal('C10');
      }),
    );

    it(
      'handles RETURNED transactions correctly',
      replayHttp('synapse-returned.json', async () => {
        const externalId = '5c64ca4505acd40065fd810e';
        const transaction = await SynapseGateway.fetchTransaction({
          externalId,
          type: PaymentProviderTransactionType.AdvancePayment,
        });

        expect(transaction.status).to.equal(PaymentProviderTransactionStatus.Returned);
        expect(transaction.outcome.code).to.equal('R01');
      }),
    );

    it(
      'fetches payments with a user if user info is provided',
      replayHttp('domain/payment-provider/synapsepay/fetch-with-user.json', async () => {
        const userSynapseId = '5d9be7e677ce003fa75f40e7';
        const synapseNodeId = '5d9be7e88d1b7d14da0e0ad5';
        const userId = '1';

        const user = await factory.create('user', {
          synapsepayId: userSynapseId,
          id: userId,
        });
        const account: BankAccount = await factory.create('checking-account', {
          synapseNodeId,
          userId,
        });

        const trans = await synapseNode.charge(user, account, 100, 'asdfsdf');

        const transaction = await SynapseGateway.fetchTransaction({
          externalId: trans.id,
          type: PaymentProviderTransactionType.AdvancePayment,
          secret: userId,
          sourceId: account.synapseNodeId,
          ownerId: user.synapsepayId,
        });

        expect(transaction.status).to.equal(PaymentProviderTransactionStatus.Pending);
      }),
    );

    it(
      'fetches disbursals with a user if user info is provided',
      replayHttp('synapse-non-dave-user-disbursal.json', async () => {
        const userSynapseId = '5d9be7ef92571b4ef1501244';
        const synapseNodeId = '5d9be7f1ed2a1e14db344160';
        const userId = '3';

        const trans = await synapseNode.disburse(synapseNodeId, 'asdfsdf', 100);

        const transaction = await SynapseGateway.fetchTransaction({
          externalId: trans._id,
          type: PaymentProviderTransactionType.AdvanceDisbursement,
          secret: userId,
          sourceId: synapseNodeId,
          ownerId: userSynapseId,
        });

        expect(transaction.status).to.equal(PaymentProviderTransactionStatus.Pending);
      }),
    );
  });

  describe('createTransaction', () => {
    it(
      'Should disburse to a synapsepay account',
      replayHttp('domain/payment-provider/synapsepay/disburse.json', async () => {
        const referenceId = 'my-test-ref-3';
        const transaction = await SynapseGateway.createTransaction({
          sourceId: '5c64c6397b08ab8e4fe6850f',
          type: PaymentProviderTransactionType.AdvanceDisbursement,
          referenceId,
          amount: 25,
        });

        expect(transaction.externalId).to.be.a('string');
        expect(transaction.externalId).to.eq('5dd6f76e5f5cb8dcb292f115');
        expect(transaction.status).to.equal('PENDING');
      }),
    );

    it(
      'Should handle 500 error as pending',
      replayHttp('domain/payment-provider/synapsepay/disburse-500-error.json', async () => {
        const referenceId = 'my-test-ref-3';
        const transaction = await SynapseGateway.createTransaction({
          sourceId: '5c64c6397b08ab8e4fe6850f',
          type: PaymentProviderTransactionType.AdvanceDisbursement,
          referenceId,
          amount: 25,
        });

        expect(transaction.status).to.equal('PENDING');
        expect(transaction.processor).to.equal('SYNAPSEPAY');
        expect(transaction.referenceId).to.equal(referenceId);
        expect(transaction.externalId).to.equal('5dd6f770795dc6d18dc8d1cc');
      }),
    );
  });
});
