import BankConnectionUpdate from '../../../src/models/warehouse/bank-connection-update';
import factory from '../../factories';
import { expect } from 'chai';
import redisClient from '../../../src/lib/redis';
import { clean } from '../../test-helpers';
import { PLAID_WEBHOOK_CODE } from '../../../src/typings';
import pubsub from '../../../src/lib/pubsub';
import * as sinon from 'sinon';
import * as BankingDataSync from '../../../src/domain/banking-data-sync';
import { getBankConnectionUpdateRedisKey } from '../../../src/domain/banking-data-sync/bank-connection-update';

describe('Banking Data Sync Bank Connection Update', () => {
  const sandbox = sinon.createSandbox();

  before(() => clean());

  afterEach(() => clean(sandbox));

  describe('queueMissedBankConnectionUpdates', () => {
    it('Should not error if key does not exist in redis', async () => {
      const createSpy = sandbox.spy(BankConnectionUpdate, 'create');
      const conn = await factory.create('bank-connection');
      await BankingDataSync.queueMissedBankConnectionUpdates(conn);
      expect(createSpy.callCount).to.equal(0);
    });

    it('should publish the update to pubsub and create the bank connection updates', async () => {
      const itemId = 'asdfasdf';
      sandbox.stub(pubsub, 'publish').resolves();
      const createSpy = sandbox.spy(BankConnectionUpdate, 'create');
      await BankingDataSync.saveMissingBankConnectionUpdate(
        PLAID_WEBHOOK_CODE.DEFAULT_UPDATE,
        itemId,
        [],
      );
      const conn = await factory.create('bank-connection', { externalId: itemId });
      await BankingDataSync.queueMissedBankConnectionUpdates(conn);
      expect(createSpy.callCount).to.eq(1);
    });
  });

  describe('saveMissingBankConnectionUpdate', () => {
    it('Save should add a key to redis', async () => {
      const itemId = 'asdfasdf';
      await BankingDataSync.saveMissingBankConnectionUpdate(
        PLAID_WEBHOOK_CODE.DEFAULT_UPDATE,
        itemId,
        [],
      );
      const key = getBankConnectionUpdateRedisKey(itemId);
      const savedItem = await redisClient.lrangeAsync(key, 0, -1);
      expect(savedItem.length).to.equal(1);
      expect(JSON.parse(savedItem[0]).code).to.equal(PLAID_WEBHOOK_CODE.DEFAULT_UPDATE);
      const ttl = await redisClient.ttlAsync(key);
      expect(ttl > 3500).to.equal(true);
    });
  });
});
