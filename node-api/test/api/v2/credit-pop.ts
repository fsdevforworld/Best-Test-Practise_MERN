import { expect } from 'chai';
import * as request from 'supertest';
import * as sinon from 'sinon';

import app from '../../../src/api';
import { BankAccount, BankConnection, CreditPopCode, User, UserSession } from '../../../src/models';

import factory from '../../factories';
import { clean } from '../../test-helpers';

import { CREDIT_POP_BASE_URL, USER_ID_URL_PARAM } from '../../../src/api/v2/credit-pop';
import { BankingDataSource } from '@dave-inc/wire-typings';
import { RecurringTransactionStatus } from '../../../src/typings';

describe('/v2/credit_pop/*', () => {
  const sandbox = sinon.createSandbox();
  let user: User;
  let userSession: UserSession;
  let unassignedCode: CreditPopCode;

  beforeEach(async () => {
    await clean();
    user = await factory.create('user', { hasSession: true });
    userSession = await factory.create('user-session', {
      userId: user.id,
    });
    unassignedCode = await factory.create('credit-pop-code');
  });

  after(() => clean(sandbox));

  describe('POST /v2/credit_pop', () => {
    context('with Dave bank account', () => {
      let daveBankConnection: BankConnection;
      let daveBankAccount: BankAccount;

      beforeEach(async () => {
        daveBankConnection = await factory.create('bank-connection', {
          userId: user.id,
          bankingDataSource: BankingDataSource.BankOfDave,
        });
        daveBankAccount = await factory.create('bank-account', {
          userId: user.id,
          bankConnectionId: daveBankConnection.id,
          subtype: 'CHECKING',
        });
        await BankConnection.update(
          { primaryBankAccountId: daveBankAccount.id },
          { where: { id: daveBankConnection.id } },
        );
        await factory.create('recurring-transaction', {
          bankAccountId: daveBankAccount.id,
          userId: user.id,
          userAmount: 400,
          status: RecurringTransactionStatus.VALID,
        });
      });

      it('only assigns a previously unassigned code', async () => {
        unassignedCode.userId = user.id;
        await unassignedCode.save();
        const response = await request(app)
          .post('/v2/credit_pop')
          .set('Authorization', userSession.token)
          .set('X-Device-Id', userSession.deviceId);

        expect(response.status).to.equal(200);
        expect(response.body).to.equal(
          `${CREDIT_POP_BASE_URL}${unassignedCode.code}${USER_ID_URL_PARAM}${user.id}`,
        );
      });
      it('returns an unassigned code to Dave bank user with direct deposit', async () => {
        const response = await request(app)
          .post('/v2/credit_pop')
          .set('Authorization', userSession.token)
          .set('X-Device-Id', userSession.deviceId);

        expect(response.status).to.equal(200);
        expect(response.body).to.equal(
          `${CREDIT_POP_BASE_URL}${unassignedCode.code}${USER_ID_URL_PARAM}${user.id}`,
        );
      });
      it('throws ForbiddenError when user does NOT have direct deposit with dave bank account', async () => {
        const anotherUser = await factory.create('user', { hasSession: true });
        const anotherUserSession = await factory.create('user-session', {
          userId: anotherUser.id,
        });
        const anotherDaveBankConnection = await factory.create('bank-connection', {
          userId: anotherUser.id,
          bankingDataSource: BankingDataSource.BankOfDave,
        });
        await factory.create('bank-account', {
          userId: anotherUser.id,
          bankConnectionId: anotherDaveBankConnection.id,
          subtype: 'CHECKING',
        });
        const response = await request(app)
          .post('/v2/credit_pop')
          .set('Authorization', anotherUserSession.token)
          .set('X-Device-Id', anotherUserSession.deviceId);
        expect(response.status).to.equal(403);
      });

      it('throws NotFoundError when all codes have been assigned users', async () => {
        const greedyUser = await factory.create('user');
        unassignedCode.userId = greedyUser.id;
        await unassignedCode.save();

        const response = await request(app)
          .post('/v2/credit_pop')
          .set('Authorization', userSession.token)
          .set('X-Device-Id', userSession.deviceId);

        expect(response.status).to.equal(404);
      });
    });

    it('throws ForbiddenError when user does NOT have a dave bank account', async () => {
      const anotherUser = await factory.create('user', { hasSession: true });
      const anotherUserSession = await factory.create('user-session', {
        userId: anotherUser.id,
      });
      const anotherDaveBankConnection = await factory.create('bank-connection', {
        userId: anotherUser.id,
        bankingDataSource: BankingDataSource.Plaid,
      });
      await factory.create('bank-account', {
        userId: anotherUser.id,
        bankConnectionId: anotherDaveBankConnection.id,
        subtype: 'CHECKING',
      });
      const response = await request(app)
        .post('/v2/credit_pop')
        .set('Authorization', anotherUserSession.token)
        .set('X-Device-Id', anotherUserSession.deviceId);
      expect(response.status).to.equal(403);
    });
  });
});
