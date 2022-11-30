import { BankingDataSource } from '@dave-inc/wire-typings';
import * as sinon from 'sinon';
import * as Faker from 'faker';
import pubsub from '../../../src/lib/pubsub';

import { bankConnectionUpdateEvent } from '../../../src/domain/event';

import { EventTopic, PLAID_WEBHOOK_CODE } from '../../../src/typings';

describe('Events', () => {
  const sandbox = sinon.createSandbox();

  before(() => sandbox.restore());

  afterEach(() => sandbox.restore());

  describe('bankConnectionUpdate', () => {
    it('should publish event via pubsub', async () => {
      const publishStub = sandbox.stub(pubsub, 'publish');

      const eventData = {
        itemId: 'fake-item-id',
        userId: Faker.random.number(),
        source: BankingDataSource.Plaid,
        initial: true,
        historical: false,
        code: PLAID_WEBHOOK_CODE.INITIAL_UPDATE,
      };

      await bankConnectionUpdateEvent.publish(eventData);

      sinon.assert.calledOnce(publishStub);
      sinon.assert.calledWith(publishStub, EventTopic.BankConnectionUpdate, eventData);
    });
    it('should subscribe via pubsub', () => {
      const subscribeStub = sandbox.stub(pubsub, 'subscribe');

      const subscriptionOptions = {
        subscriptionName: 'fake-subscriber',
        onMessage: sandbox.stub(),
        onError: sandbox.stub(),
        options: { flowControl: { maxMessages: 1 } },
      };

      bankConnectionUpdateEvent.subscribe(subscriptionOptions);

      sinon.assert.calledOnce(subscribeStub);
      sinon.assert.calledWith(
        subscribeStub,
        EventTopic.BankConnectionUpdate,
        subscriptionOptions.subscriptionName,
        subscriptionOptions.onMessage,
        subscriptionOptions.onError,
        subscriptionOptions.options,
      );
    });
  });
});
