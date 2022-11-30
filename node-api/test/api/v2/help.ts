import { DEFAULT_REASONS_CATEGORY } from '@dave-inc/wire-typings';
import { expect } from 'chai';
import * as request from 'supertest';
import * as config from 'config';
import * as sinon from 'sinon';
import { replayHttp, clean } from '../../test-helpers';
import factory from '../../factories';
import app from '../../../src/api';
import { User } from '../../../src/models';
import redisClient from '../../../src/lib/redis';
import { dogstatsd } from './../../../src/lib/datadog-statsd';
import zendesk from '../../../src/lib/zendesk';
import {
  defaultAdvanceOverdraftHelpCenterData,
  defaultBankingHelpCenterData,
  defaultOverdraftHelpCenterData,
} from '../../../bin/dev-seed/help-center';

const agentCountRedisKey = config.get<string>('liveChat.agentCountRedisKey');
const bankingHelpCenterRedisKey = config.get<string>('helpCenter.bankingRedisKey');
const overdraftHelpCenterRedisKey = config.get<string>('helpCenter.overdraftRedisKey');
const advanceHelpCenterRedisKey = config.get<string>('helpCenter.advanceRedisKey');

describe('v2/help endpoints', () => {
  const sandbox = sinon.createSandbox();

  before(() => clean());
  afterEach(() => clean(sandbox));

  describe('GET /v2/help_topics', () => {
    it('should get five questions and answers', () => {
      return request(app)
        .get('/v2/help_topics')
        .expect(200)
        .then(res => {
          expect(res.body.length).to.equal(4);
          res.body.forEach((helpTopic: any) => {
            expect(helpTopic.question).to.be.a('string');
            expect(helpTopic.answer).to.be.a('string');
          });
        });
    });
  });

  describe('GET /v2/help/user_ticket_reasons', () => {
    let user: User;
    beforeEach(async () => {
      user = await factory.create('user');
    });

    it(
      'should return user and bank user submitted reasons separated by category alphabeticaly except for General',
      replayHttp('help/user-ticket-reasons-success.json', async () => {
        await factory.create('bank-of-dave-bank-connection', { userId: user.id });
        const response = await request(app)
          .get('/v2/help/user_ticket_reasons')
          .set('Authorization', `${user.id}`)
          .set('X-Device-Id', `${user.id}`)
          .send();
        expect(response.status).to.be.eq(200);
        const { daveBanking, dave } = response.body;
        const daveBankingCategories = Object.keys(daveBanking);
        const daveCategories = Object.keys(dave);
        expect(daveBankingCategories.shift()).to.be.eq(DEFAULT_REASONS_CATEGORY);
        expect(daveCategories.shift()).to.be.eq(DEFAULT_REASONS_CATEGORY);
        expect(daveBankingCategories).to.be.eq(daveBankingCategories.sort());
        expect(daveCategories).to.be.eq(daveCategories.sort());
      }),
    );

    it('should throw a 502 if the zendesk call errors out', async () => {
      sandbox.stub(zendesk, 'listTicketFieldOptions').throws(new Error());
      const dogstatsdSpy = sandbox.spy(dogstatsd, 'increment');
      const response = await request(app)
        .get('/v2/help/user_ticket_reasons')
        .set('Authorization', `${user.id}`)
        .set('X-Device-Id', `${user.id}`)
        .send();
      expect(response.status).to.be.eq(502);
      sinon.assert.calledWith(dogstatsdSpy, 'zendesk.get_user_ticket_reasons.failed');
    });
  });

  describe('GET v2/help/chat_agent_count', () => {
    it('should return zero agents online', async () => {
      const [user] = await Promise.all([
        factory.create('user', {}, { hasSession: true }),
        redisClient.setAsync(agentCountRedisKey, 0),
      ]);

      const res = await request(app)
        .get('/v2/help/chat_agent_count')
        .set('Authorization', user.id)
        .set('X-Device-Id', user.id)
        .expect(200);

      expect(res.body.agentCount).to.be.a('number');
      expect(res.body.agentCount).to.be.equal(0);
    });

    it('should return 2 agents online', async () => {
      const [user] = await Promise.all([
        factory.create('user', {}, { hasSession: true }),
        redisClient.setAsync(agentCountRedisKey, 2),
      ]);

      const res = await request(app)
        .get('/v2/help/chat_agent_count')
        .set('Authorization', user.id)
        .set('X-Device-Id', user.id)
        .expect(200);

      expect(res.body.agentCount).to.equal(2);
    });

    it('should return zero if no redis key exists', async () => {
      const user = await factory.create('user', {}, { hasSession: true });
      const res = await request(app)
        .get('/v2/help/chat_agent_count')
        .set('Authorization', user.id)
        .set('X-Device-Id', user.id)
        .expect(200);

      expect(res.body.agentCount).to.equal(0);
    });
  });

  describe('POST /v2/help/help_center/article/:id/vote', () => {
    it('should return true for successful upvote)', async () => {
      const user = await factory.create('user', {}, { hasSession: true });
      sandbox.stub(zendesk, 'voteArticleUpOrDown').returns(true);
      const res = await request(app)
        .post('/v2/help/help_center/article/1/vote')
        .set('Authorization', user.id.toString())
        .set('X-Device-Id', user.id.toString())
        .send({ direction: 'up' });
      expect(res.status).to.equal(200);
      expect(res.body.success).to.equal(true);
    });

    it('should return true for successful UPPERCASE upvote)', async () => {
      const user = await factory.create('user', {}, { hasSession: true });
      sandbox.stub(zendesk, 'voteArticleUpOrDown').returns(true);
      const res = await request(app)
        .post('/v2/help/help_center/article/1/vote')
        .set('Authorization', user.id.toString())
        .set('X-Device-Id', user.id.toString())
        .send({ direction: 'UP' });
      expect(res.status).to.equal(200);
      expect(res.body.success).to.equal(true);
    });

    it('should return true for successful mIxEd case down vote)', async () => {
      sandbox.stub(zendesk, 'voteArticleUpOrDown').returns(true);
      const user = await factory.create('user', {}, { hasSession: true });
      const res = await request(app)
        .post('/v2/help/help_center/article/1/vote')
        .set('Authorization', user.id.toString())
        .set('X-Device-Id', user.id.toString())
        .send({ direction: 'dOWn' });
      expect(res.status).to.equal(200);
      expect(res.body.success).to.equal(true);
    });

    it('should throw for invalid vote direction', async () => {
      const user = await factory.create('user', {}, { hasSession: true });
      const res = await request(app)
        .post('/v2/help/help_center/article/1/vote')
        .set('Authorization', user.id.toString())
        .set('X-Device-Id', user.id.toString())
        .send({ direction: 'invaliddirection' });
      expect(res.status).to.equal(400);
    });

    it('should return false if zendesk call returns false', async () => {
      sandbox.stub(zendesk, 'voteArticleUpOrDown').returns(false);
      const user = await factory.create('user', {}, { hasSession: true });
      const res = await request(app)
        .post('/v2/help/help_center/article/1/vote')
        .set('Authorization', user.id.toString())
        .set('X-Device-Id', user.id.toString())
        .send({ direction: 'up' });
      expect(res.status).to.equal(200);
      expect(res.body.success).to.equal(false);
    });
  });

  describe('POST /v2/help/ticket', () => {
    it('should fail if the user creation fails', async () => {
      const user = await factory.create('user', {}, { hasSession: true });
      const userError = new Error('something went bad at ZD');
      sandbox.stub(zendesk, 'createOrUpdateZendeskEndUser').throws(userError);
      const res = await request(app)
        .post('/v2/help/ticket')
        .set('Authorization', user.id.toString())
        .set('X-Device-Id', user.id.toString())
        .send({
          subject: 'please help',
          reason: 'borrowing_money__why_did_my_amount_go_down_',
          description: 'I am trying to do thing A, but I need help with thing B also',
          memberType: ['banking_-_checking', 'advance'],
          brand: 'dave',
        });
      expect(res.status).to.equal(500);
    });

    it('should fail if missing required field', async () => {
      const user = await factory.create('user', {}, { hasSession: true });
      const res = await request(app)
        .post('/v2/help/ticket')
        .set('Authorization', user.id.toString())
        .set('X-Device-Id', user.id.toString())
        .send({
          reason: 'borrowing_money__why_did_my_amount_go_down_',
          description: 'I am trying to do thing A, but I need help with thing B also',
          memberType: ['banking_-_checking', 'advance'],
          brand: 'dave',
        });
      expect(res.status).to.equal(400);
    });

    it('should fail with an invalid brand', async () => {
      const user = await factory.create('user', {}, { hasSession: true });
      const zdUserId = 8;
      sandbox.stub(zendesk, 'createTicket').returns(true);
      sandbox.stub(zendesk, 'createOrUpdateZendeskEndUser').resolves(zdUserId);
      const res = await request(app)
        .post('/v2/help/ticket')
        .set('Authorization', user.id.toString())
        .set('X-Device-Id', user.id.toString())
        .send({
          subject: 'please help',
          reason: 'borrowing_money__why_did_my_amount_go_down_',
          description: 'I am trying to do thing A, but I need help with thing B also',
          memberType: ['banking_-_checking', 'advance'],
          brand: 'invalid',
        });
      expect(res.status).to.equal(400);
    });

    it('should succeed with invalid reason/member type', async () => {
      const user = await factory.create('user', {}, { hasSession: true });
      const zdUserId = 8;
      sandbox.stub(zendesk, 'createTicket').returns(true);
      sandbox.stub(zendesk, 'createOrUpdateZendeskEndUser').resolves(zdUserId);
      const res = await request(app)
        .post('/v2/help/ticket')
        .set('Authorization', user.id.toString())
        .set('X-Device-Id', user.id.toString())
        .send({
          subject: 'please help',
          reason: 'invalid',
          description: 'I am trying to do thing A, but I need help with thing B also',
          memberType: ['invalid', 'advance'],
          brand: 'dave',
        });
      expect(res.status).to.equal(200);
    });

    it('should succeed if we can create user and ticket if dave brand', async () => {
      const user = await factory.create('user', {}, { hasSession: true });
      const zdUserId = 8;
      sandbox.stub(zendesk, 'createTicket').returns(true);
      sandbox.stub(zendesk, 'createOrUpdateZendeskEndUser').resolves(zdUserId);
      const res = await request(app)
        .post('/v2/help/ticket')
        .set('Authorization', user.id.toString())
        .set('X-Device-Id', user.id.toString())
        .send({
          subject: 'please help',
          reason: 'borrowing_money__why_did_my_amount_go_down_',
          description: 'I am trying to do thing A, but I need help with thing B also',
          memberType: ['banking_-_checking', 'advance'],
          brand: 'dave',
        });
      expect(res.status).to.equal(200);
    });

    it('should succeed if we can create user and ticket if dave banking brand', async () => {
      const user = await factory.create('user', {}, { hasSession: true });
      const zdUserId = 8;
      sandbox.stub(zendesk, 'createTicket').returns(true);
      sandbox.stub(zendesk, 'createOrUpdateZendeskEndUser').resolves(zdUserId);
      const res = await request(app)
        .post('/v2/help/ticket')
        .set('Authorization', user.id.toString())
        .set('X-Device-Id', user.id.toString())
        .send({
          subject: 'please help',
          reason: 'borrowing_money__why_did_my_amount_go_down_',
          description: 'I am trying to do thing A, but I need help with thing B also',
          memberType: ['banking_-_checking', 'advance'],
          brand: 'daveBanking',
        });
      expect(res.status).to.equal(200);
    });

    it('should succeed even if the attachments fail', async () => {
      const user = await factory.create('user', {}, { hasSession: true });
      const zdUserId = 8;
      sandbox.stub(zendesk, 'createTicket').returns(true);
      sandbox.stub(zendesk, 'createOrUpdateZendeskEndUser').resolves(zdUserId);
      const error = new Error('cant attach');
      sandbox.stub(zendesk, 'uploadFiles').throws(error);
      const res = await request(app)
        .post('/v2/help/ticket')
        .set('Authorization', user.id.toString())
        .set('X-Device-Id', user.id.toString())
        .send({
          subject: 'please help',
          reason: 'borrowing_money__why_did_my_amount_go_down_',
          description: 'I am trying to do thing A, but I need help with thing B also',
          memberType: ['banking_-_checking', 'advance'],
          brand: 'dave',
          filesContent: [
            'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
          ],
        });
      expect(res.status).to.equal(200);
    });

    it('should fail with more than 10 attachments', async () => {
      const user = await factory.create('user', {}, { hasSession: true });
      const zdUserId = 8;
      sandbox.stub(zendesk, 'createTicket').returns(true);
      sandbox.stub(zendesk, 'createOrUpdateZendeskEndUser').resolves(zdUserId);
      const error = new Error("can't attach");
      sandbox.stub(zendesk, 'uploadFiles').throws(error);
      const res = await request(app)
        .post('/v2/help/ticket')
        .set('Authorization', user.id.toString())
        .set('X-Device-Id', user.id.toString())
        .send({
          subject: 'please help',
          reason: 'borrowing_money__why_did_my_amount_go_down_',
          description: 'I am trying to do thing A, but I need help with thing B also',
          memberType: ['banking_-_checking', 'advance'],
          brand: 'dave',
          filesContent: [
            'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
            'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
            'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
            'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
            'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
            'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
            'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
            'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
            'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
            'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
            'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
          ],
        });
      expect(res.status).to.equal(400);
    });
  });

  describe('GET /v2/help/help_center', () => {
    it('should return advance help center data', async () => {
      const [user] = await Promise.all([
        factory.create<User>('user'),
        redisClient.setAsync(
          bankingHelpCenterRedisKey,
          JSON.stringify(defaultBankingHelpCenterData),
        ),
      ]);
      const res = await request(app)
        .get('/v2/help/help_center')
        .set('Authorization', user.id.toString())
        .set('X-Device-Id', user.id.toString())
        .send();
      expect(res.status).to.equal(200);
      expect(res.body.sections.length).to.be.greaterThan(0);
      expect(res.body.topArticles.length).to.be.greaterThan(0);
      await redisClient.flushallAsync();
    });
  });

  describe('GET /v2/help/help_center/advance', () => {
    it('should return advance help center data', async () => {
      const [user] = await Promise.all([
        factory.create<User>('user'),
        redisClient.setAsync(
          advanceHelpCenterRedisKey,
          JSON.stringify(defaultAdvanceOverdraftHelpCenterData),
        ),
      ]);
      const res = await request(app)
        .get('/v2/help/help_center/advance')
        .set('Authorization', user.id.toString())
        .set('X-Device-Id', user.id.toString())
        .send();
      expect(res.status).to.equal(200);
      expect(res.body.articles.length).to.be.greaterThan(0);
      expect(res.body.sections.length).to.be.greaterThan(0);
      expect(res.body.topArticles.length).to.be.greaterThan(0);
      await redisClient.flushallAsync();
    });
  });

  describe('GET /v2/help/help_center/overdraft', () => {
    it('should return advance help center data', async () => {
      const [user] = await Promise.all([
        factory.create<User>('user'),
        redisClient.setAsync(
          overdraftHelpCenterRedisKey,
          JSON.stringify(defaultOverdraftHelpCenterData),
        ),
      ]);
      const res = await request(app)
        .get('/v2/help/help_center/overdraft')
        .set('Authorization', user.id.toString())
        .set('X-Device-Id', user.id.toString())
        .send();
      expect(res.status).to.equal(200);
      expect(res.body.sections.length).to.be.greaterThan(0);
      expect(res.body.topArticles.length).to.be.greaterThan(0);
      await redisClient.flushallAsync();
    });
  });
});
