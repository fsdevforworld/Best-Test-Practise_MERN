import { expect } from 'chai';
import * as request from 'supertest';
import { clean } from '../../test-helpers';
import * as sinon from 'sinon';
import app, { BASE_SERVICE_PATH } from '../../../src/services/seed-user';
import { BankAccount, User } from '../../../src/models';
import * as DevSeed from '../../../bin/dev-seed';
import factory from '../../factories';
import { moment } from '@dave-inc/time-lib';
import { BankingDataSource } from '@dave-inc/wire-typings';
import BankingDataClient from '../../../src/lib/heath-client';
import * as BankingDataSync from '../../../src/domain/banking-data-sync';
import { BalanceLogCaller } from '../../../src/typings';

describe('Seed User Endpoints', () => {
  const sandbox = sinon.createSandbox();
  before(() => clean());
  afterEach(() => {
    sandbox.restore();
  });

  describe('user endpoints', () => {
    let user: User;

    beforeEach(async () => {
      user = await factory.create<User>('user', {
        allowDuplicateCard: false,
      });
    });
    describe('PATCH /user/:id', () => {
      it('should patch a user setting allowDuplicateCard', async () => {
        const result = await request(app)
          .patch(`${BASE_SERVICE_PATH}/user/${user.id}`)
          .send({
            allowDuplicateCard: true,
          })
          .expect(200);

        await user.reload();

        expect(user.allowDuplicateCard).to.be.true;
        expect(result.ok).to.be.true;
      });
    });

    describe('Post /daily-balance-logs', () => {
      let backfillDailyBalancesStub: sinon.SinonSpy;
      beforeEach(() => {
        sandbox.stub(BankingDataClient, 'saveBalanceLogs');
        backfillDailyBalancesStub = sandbox.stub(BankingDataSync, 'backfillDailyBalances');
      });

      it('should call BankingDataSync.backfillDailyBalances and BankingDataClient.saveBalanceLogs', async () => {
        const eightDaysAgo = moment().subtract(8, 'day');
        const expectedBankAccount = await factory.create<BankAccount>('bod-checking-account', {
          userId: user.id,
        });
        const expectedAmount = 600;

        const result = await request(app)
          .post(`${BASE_SERVICE_PATH}/daily-balance-logs`)
          .send({
            amount: expectedAmount,
            date: eightDaysAgo,
            bankingDataSource: BankingDataSource.BankOfDave,
            bankAccountExternalId: expectedBankAccount.externalId,
          })
          .expect(200);

        expect(BankingDataClient.saveBalanceLogs).to.have.been.calledWith({
          available: expectedAmount,
          bankAccountId: expectedBankAccount.id,
          bankConnectionId: expectedBankAccount.bankConnectionId,
          caller: BalanceLogCaller.BinDevSeed,
          current: expectedAmount,
          date: eightDaysAgo.format(),
          processorAccountId: expectedBankAccount.externalId,
          processorName: BankingDataSource.BankOfDave,
          userId: user.id,
        });

        sandbox.assert.calledWithMatch(
          backfillDailyBalancesStub,
          {
            id: expectedBankAccount.id,
          },
          BalanceLogCaller.BinDevSeed,
          BankingDataSource.BankOfDave,
        );

        expect(result.ok).to.be.true;
      });
    });
  });

  describe('POST /seed', () => {
    describe('when invalid', () => {
      it('should throw an error if direction and phoneNumSeed are not provided in request', async () => {
        const response = await request(app)
          .post(`${BASE_SERVICE_PATH}/seed`)
          .expect(400);

        expect(response.body.type).to.eq('invalid_parameters');
        expect(response.body.message).to.contain('must provide a direction and a phoneNumSeed');
      });

      it('should throw an error if direction is not up or down', async () => {
        const response = await request(app)
          .post(`${BASE_SERVICE_PATH}/seed`)
          .send({ direction: 'sidewayz', phoneNumSeed: 317 })
          .expect(400);

        expect(response.body.type).to.eq('invalid_parameters');
        expect(response.body.message).to.contain('direction must be up or down');
      });

      it('should throw an error if phoneNumSeed is not a number', async () => {
        const response = await request(app)
          .post(`${BASE_SERVICE_PATH}/seed`)
          .send({ direction: 'up', phoneNumSeed: '317' })
          .expect(400);

        expect(response.body.type).to.eq('invalid_parameters');
        expect(response.body.message).to.contain('phoneNumSeed must be a number');
      });
    });

    describe('when valid', () => {
      it('should successfully seed db up', async () => {
        const stub = sandbox.stub(DevSeed, 'runAllSeeds');
        await request(app)
          .post(`${BASE_SERVICE_PATH}/seed`)
          .send({ direction: 'up', phoneNumSeed: 317 })
          .expect(200);

        expect(stub.firstCall.args).to.deep.eq(['up', 317]);
      });

      it('should successfully seed db down', async () => {
        const stub = sandbox.stub(DevSeed, 'runAllSeeds');
        await request(app)
          .post(`${BASE_SERVICE_PATH}/seed`)
          .send({ direction: 'down', phoneNumSeed: 317 })
          .expect(200);

        expect(stub.firstCall.args).to.deep.eq(['down', 317]);
      });
    });
  });
});
