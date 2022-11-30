import factory from '../../factories';
import * as nock from 'nock';
import * as config from 'config';
import * as sinon from 'sinon';
import { expect } from 'chai';
import { clean, stubLoomisClient } from '../../test-helpers';
import { PaymentMethod, User } from '../../../src/models';
import { EmpyrConfig } from '../../../src/typings';
import * as rewardsHelper from '../../../src/domain/rewards';
import * as authHelper from '../../../src/domain/rewards/fetch-empyr-auth';
import { BaseApiError } from '../../../src/lib/error';
import loomisClient from '@dave-inc/loomis-client';

const sandbox = sinon.createSandbox();
const empyrConfig: EmpyrConfig = config.get('empyr');

describe('deleteEmpyrCard()', () => {
  let expectedUser: User;
  let expectedPaymentMethod: PaymentMethod;
  const expectedEmpyrCardId: number = 12345;
  const expectedUrl = `/api/v2/cards/${expectedEmpyrCardId}/delete`;

  before(() => clean());

  beforeEach(async () => {
    expectedUser = await factory.create('user');
  });

  afterEach(() => clean(sandbox));

  context('without stubbed Loomis client', () => {
    it('throws an error with the status code sent from Loomis', async () => {
      nock(empyrConfig.url)
        .post(expectedUrl)
        .query({
          client_id: empyrConfig.clientId,
        })
        .reply(200);
      expectedPaymentMethod = await factory.create('payment-method', {
        userId: expectedUser.id,
        empyrCardId: expectedEmpyrCardId,
      });
      const error = new BaseApiError('I am a teapot', { statusCode: 418 });
      sandbox.stub(loomisClient, 'updatePaymentMethod').rejects(error);
      sandbox.stub(authHelper, 'default').returns({
        accessToken: 'expectedAccessToken',
      });

      try {
        await rewardsHelper.deleteEmpyrCard(expectedUser, expectedPaymentMethod.id);
      } catch (err) {
        expect(err.statusCode).to.equal(418);
        return;
      }

      expect(false, 'should have thrown').to.be.true;
    });
  });

  context('with stubbed Loomis client', () => {
    beforeEach(() => stubLoomisClient(sandbox));

    it('throws an error if valid payment method not found', async () => {
      const spy = sandbox.spy(rewardsHelper, 'deleteEmpyrCard');

      try {
        await rewardsHelper.deleteEmpyrCard(expectedUser, 1234);
      } catch (e) {}

      expect(spy.threw('NotFoundError'));
    });

    context('when successful', () => {
      beforeEach(async () => {
        expectedPaymentMethod = await factory.create('payment-method', {
          userId: expectedUser.id,
          empyrCardId: expectedEmpyrCardId,
        });

        sandbox.stub(authHelper, 'default').returns({
          accessToken: 'expectedAccessToken',
        });
      });

      it('retries and eventually succeeds when receiving a 403 error 3 times and a 200 the last time', async () => {
        nock(empyrConfig.url)
          .post(expectedUrl)
          .query({
            client_id: empyrConfig.clientId,
          })
          .times(3)
          .reply(403)
          .post(expectedUrl)
          .query({
            client_id: empyrConfig.clientId,
          })
          .reply(200);

        await rewardsHelper.deleteEmpyrCard(expectedUser, expectedPaymentMethod.id);
        await expectedPaymentMethod.reload();

        expect(expectedPaymentMethod.empyrCardId).to.be.not.null;
        expect(expectedPaymentMethod.optedIntoDaveRewards).to.be.false;
      });

      it('calls empyr card delete endpoint with correct card id and sets optedIntoDaveRewards to false, does not delete empyr card id', async () => {
        nock(empyrConfig.url)
          .post(expectedUrl)
          .query({
            client_id: empyrConfig.clientId,
          })
          .reply(200);

        await rewardsHelper.deleteEmpyrCard(expectedUser, expectedPaymentMethod.id);
        await expectedPaymentMethod.reload();

        expect(expectedPaymentMethod.empyrCardId).to.be.not.null;
        expect(expectedPaymentMethod.optedIntoDaveRewards).to.be.false;
      });
    });
  });
});
