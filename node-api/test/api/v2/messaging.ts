import * as request from 'supertest';
import * as sinon from 'sinon';
import app from '../../../src/api';
import 'mocha';
import { expect } from 'chai';
import { User } from '../../../src/models';
import 'chai-json-schema';
import braze from '../../../src/lib/braze';
import { clean, up } from '../../test-helpers';
import factory from '../../factories';
import { daveBankingClient } from '../../../src/api/v2/messaging';

describe('/v2/messaging', () => {
  const sandbox = sinon.createSandbox();

  let bankingIncomingTextStub: sinon.SinonStub;

  before(() => clean());
  beforeEach(async () => {
    await up();
    bankingIncomingTextStub = sandbox
      .stub(daveBankingClient, 'incomingTextReceived')
      .resolves({ data: { isHandled: false } });
  });
  afterEach(() => clean(sandbox));

  describe('POST /v2/messaging', () => {
    it('should unsubscribe users when they text stop', async () => {
      const user: User = await factory.create('user');
      const stub = sandbox.stub(braze, 'track').resolves();

      expect(Boolean(user.unsubscribed)).to.equal(false);

      const result = await request(app)
        .post('/v2/messaging/incoming')
        .send({
          Body: 'stop',
          From: user.phoneNumber,
        });

      expect(result.status).to.equal(200);
      expect(result.text).to.match(/You are unsubscribed/);

      await user.reload();
      expect(user.unsubscribed).to.equal(true);
      expect(stub).to.have.been.calledWith({
        attributes: [{ externalId: `${user.id}`, subscribe: false }],
      });

      expect(bankingIncomingTextStub).not.to.have.been.called;
    });

    it('should not unsubscribe users without matching number', async () => {
      const user: User = await factory.create('user');
      const stub = sandbox.stub(braze, 'track').resolves();

      expect(Boolean(user.unsubscribed)).to.equal(false);

      const result = await request(app)
        .post('/v2/messaging/incoming')
        .send({
          Body: 'stop',
          From: '5555555555',
        });

      expect(result.status).to.equal(200);
      expect(result.text).to.match(/Please contact customer service/);

      await user.reload();
      expect(user.unsubscribed).to.equal(false);
      expect(stub).not.to.have.been.called;
      expect(bankingIncomingTextStub).not.to.have.been.called;
    });

    it('should resubscribe users when they text start', async () => {
      const user: User = await factory.create('user');
      const stub = sandbox.stub(braze, 'track').resolves();
      await user.update({ unsubscribed: true });

      expect(user.unsubscribed).to.equal(true);

      const result = await request(app)
        .post('/v2/messaging/incoming')
        .send({
          Body: 'start',
          From: user.phoneNumber,
        });

      expect(result.status).to.equal(200);
      expect(result.text).to.match(/You have resubscribed/);

      await user.reload();
      expect(user.unsubscribed).to.equal(false);
      expect(stub).to.have.been.calledWith({
        attributes: [{ externalId: `${user.id}`, subscribe: true }],
      });
      expect(bankingIncomingTextStub).not.to.have.been.called;
    });

    it('should resubscribe users when they text start<space character>', async () => {
      const user: User = await factory.create('user');
      const stub = sandbox.stub(braze, 'track').resolves();
      await user.update({ unsubscribed: true });

      expect(user.unsubscribed).to.equal(true);

      const result = await request(app)
        .post('/v2/messaging/incoming')
        .send({
          Body: 'start ',
          From: user.phoneNumber,
        });

      expect(result.status).to.equal(200);
      expect(result.text).to.match(/You have resubscribed/);

      await user.reload();
      expect(user.unsubscribed).to.equal(false);
      expect(stub).to.have.been.calledWith({
        attributes: [{ externalId: `${user.id}`, subscribe: true }],
      });
      expect(bankingIncomingTextStub).not.to.have.been.called;
    });

    it('should not resubscribe users when they text start within part of the message', async () => {
      const user: User = await factory.create('user');
      const stub = sandbox.stub(braze, 'track').resolves();
      await user.update({ unsubscribed: true });

      expect(user.unsubscribed).to.equal(true);

      const result = await request(app)
        .post('/v2/messaging/incoming')
        .send({
          Body: 'Dave is a fintech startup',
          From: user.phoneNumber,
        });

      expect(result.status).to.equal(200);
      expect(result.text).to.match(/Help at help.dave.com/);

      await user.reload();
      expect(user.unsubscribed).to.equal(true);
      expect(stub).not.to.have.been.called;
      expect(bankingIncomingTextStub).to.be.calledOnce;
    });

    it('should not resubscribe users without matching number', async () => {
      const user: User = await factory.create('user');
      const stub = sandbox.stub(braze, 'track').resolves();
      await user.update({ unsubscribed: true });

      expect(user.unsubscribed).to.equal(true);

      const result = await request(app)
        .post('/v2/messaging/incoming')
        .send({
          Body: 'start',
          From: '5555555555',
        });

      expect(result.status).to.equal(200);
      expect(result.text).to.match(/Please contact customer service/);

      await user.reload();
      expect(user.unsubscribed).to.equal(true);
      expect(stub).not.to.have.been.called;

      expect(bankingIncomingTextStub).not.to.have.been.called;
    });

    it('should direct the user to the help site when they text us', async () => {
      const user: User = await factory.create('user');
      const result = await request(app)
        .post('/v2/messaging/incoming')
        .send({
          Body: 'fizzbuzz',
          From: user.phoneNumber,
        });

      expect(result.status).to.equal(200);
      expect(result.text).to.match(/Help at help.dave.com/);

      expect(bankingIncomingTextStub).to.be.calledOnce;
      expect(bankingIncomingTextStub).to.be.calledWith(user.id, {
        message: 'fizzbuzz',
        fromNumber: user.phoneNumber,
      });
    });

    it('should send a "no response" reply if the bank has handled the message', async () => {
      bankingIncomingTextStub.resolves({ data: { isHandled: true } });

      const user: User = await factory.create('user');
      const result = await request(app)
        .post('/v2/messaging/incoming')
        .send({
          Body: 'yes',
          From: user.phoneNumber,
        });

      expect(result.status).to.equal(200);
      expect(result.text).to.match(/<Response\/>/);

      expect(daveBankingClient.incomingTextReceived).to.be.calledOnce;
      expect(daveBankingClient.incomingTextReceived).to.be.calledWith(user.id, {
        message: 'yes',
        fromNumber: user.phoneNumber,
      });
    });

    it('should fallback if the bank API has an error', async () => {
      bankingIncomingTextStub.rejects(new Error('kaboom'));

      const user: User = await factory.create('user');
      const result = await request(app)
        .post('/v2/messaging/incoming')
        .send({
          Body: 'yes',
          From: user.phoneNumber,
        });

      expect(result.status).to.equal(200);
      expect(result.text).to.match(/Help at help.dave.com/);

      expect(daveBankingClient.incomingTextReceived).to.be.calledOnce;
      expect(daveBankingClient.incomingTextReceived).to.be.calledWith(user.id, {
        message: 'yes',
        fromNumber: user.phoneNumber,
      });
    });
  });
});
