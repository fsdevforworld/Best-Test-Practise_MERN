import { expect } from 'chai';
import * as sinon from 'sinon';
import { handleMessage } from '../../../src/consumers/synapsepay-update-user/handle-message';
import * as ProcessUpdate from '../../../src/consumers/synapsepay-update-user/process-user-update';
import { Message } from '@google-cloud/pubsub';
import * as Pubsub from '@dave-inc/pubsub';
import { UserWebhookData } from 'synapsepay';
import { readFileSync } from 'fs';
import * as path from 'path';
import logger from '../../../src/lib/logger';

describe('handleMessage', () => {
  const sandbox = sinon.createSandbox();

  afterEach(() => sandbox.restore());

  it('should catch too_many_requests errors, log them, then wait 60s before nacking', async () => {
    const tooManyRequestsError = {
      status: 429,
      text: {
        error: {
          code: 'too_many_requests',
          en: 'Too many requests hit the API too quickly.',
        },
        error_code: '429',
        http_code: '429',
        success: false,
      },
    };
    const webhookData: UserWebhookData = JSON.parse(
      readFileSync(path.join(__dirname, 'user-webhook-data.json'), 'utf8'),
    );
    const message: Message = { modAck: (delay?: number) => null, nack: () => null } as Message;
    const nackStub = sandbox.stub(Pubsub, 'nackWithDelay').resolves();
    sandbox.stub(ProcessUpdate, 'processSynapsepayUserUpdate').rejects(tooManyRequestsError);
    const consoleLogStub = sandbox.stub(logger, 'info');

    await handleMessage(message, webhookData);

    expect(consoleLogStub.callCount).to.equal(2);
    sinon.assert.callCount(nackStub, 1);
    sinon.assert.calledWith(nackStub, message, 60);
  });

  it('should wait for less time before nacking for all other errors', async () => {
    const otherError = {
      status: 500,
    };
    const webhookData: UserWebhookData = JSON.parse(
      readFileSync(path.join(__dirname, 'user-webhook-data.json'), 'utf8'),
    );
    const message: Message = { modAck: (delay?: number) => null, nack: () => null } as Message;
    sandbox.stub(ProcessUpdate, 'processSynapsepayUserUpdate').rejects(otherError);
    const nackStub = sandbox.stub(Pubsub, 'nackWithDelay');

    await handleMessage(message, webhookData);

    sinon.assert.calledOnce(nackStub);
    sinon.assert.calledWithExactly(nackStub, message, 5);
  });
});
