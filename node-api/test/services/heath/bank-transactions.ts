import { expect } from 'chai';
import * as request from 'supertest';
import { BankTransaction as DBBankTransaction, sequelize } from '../../../src/models';
import app from '../../../src/services/heath';
import factory from '../../factories';
import { isNil, isString } from 'lodash';
import { clearBankTransactionStore } from '../../test-helpers/stub-bank-transaction-client';
import * as sinon from 'sinon';
import { moment } from '@dave-inc/time-lib';
import { ConnectionError as SequelizeConnectionError } from 'sequelize';

describe('Banking Data Service Api', () => {
  const sandbox = sinon.createSandbox();
  afterEach(() => {
    sandbox.restore();
    return clearBankTransactionStore();
  });

  describe('create-transaction', () => {
    const CREATE_ROUTE = '/services/banking-data/bank-transaction';

    it('should save a transaction to the DB', async () => {
      const transaction = await factory.build('bank-transaction', { id: undefined });

      await request(app)
        .post(CREATE_ROUTE)
        .send({ bankTransactions: [transaction] })
        .expect(200)
        .then(({ body }) => {
          compareTransactions(transaction, body[0]);
        });

      const newTrans = await DBBankTransaction.findOne({
        where: { externalId: transaction.externalId },
      });
      expect(newTrans).to.exist;
    });

    [
      'bankAccountId',
      'userId',
      'externalId',
      'externalName',
      'amount',
      'transactionDate',
      'pending',
    ].forEach(field => {
      it(`should error if required ${field} is not included`, async () => {
        const transaction = await factory.build('bank-transaction', {
          id: undefined,
        });
        delete transaction[field];
        await request(app)
          .post(CREATE_ROUTE)
          .send({ bankTransactions: [transaction] })
          .expect(400);

        if (transaction.externalId) {
          const newTrans = await DBBankTransaction.findOne({
            where: { externalId: transaction.externalId },
          });
          expect(newTrans).to.not.exist;
        }
      });
    });
  });

  describe('/transactions/query', () => {
    const QUERY_ROUTE = '/services/banking-data/bank-transaction/query';
    ['id', 'amount', 'displayName'].map(field => {
      it(`Can query by field equality ${field}`, async () => {
        const transaction = await factory.create('bank-transaction');
        const { body } = await request(app)
          .post(QUERY_ROUTE)
          .send({
            bankAccountId: transaction.bankAccountId,
            filter: { [field]: transaction.field },
          })
          .expect(200);
        compareTransactions(transaction, body[0]);
      });

      it(`Can query by field lt ${field}`, async () => {
        const transaction = await factory.create('bank-transaction');
        const { body } = await request(app)
          .post(QUERY_ROUTE)
          .send({
            bankAccountId: transaction.bankAccountId,
            filter: { [field]: { lt: transaction[field] + 1 } },
          })
          .expect(200);
        compareTransactions(transaction, body[0]);
      });

      it(`Can query by field gt ${field}`, async () => {
        const transaction = await factory.create('bank-transaction');
        const compare = isString(transaction[field])
          ? transaction[field].substr(0, -1)
          : transaction[field] - 1;
        const { body } = await request(app)
          .post(QUERY_ROUTE)
          .send({
            bankAccountId: transaction.bankAccountId,
            filter: { [field]: { gt: compare } },
          })
          .expect(200);
        compareTransactions(transaction, body[0]);
      });

      it(`Will not match if gt on lt ${field}`, async () => {
        const transaction = await factory.create('bank-transaction');
        const compare = isString(transaction[field])
          ? transaction[field].substr(0, -1)
          : transaction[field] - 1;
        const { body } = await request(app)
          .post(QUERY_ROUTE)
          .send({
            bankAccountId: transaction.bankAccountId,
            filter: { [field]: { lt: compare } },
          })
          .expect(200);
        expect(body.length).to.eq(0);
      });
    });

    it('will error without a bank account id', async () => {
      const { body } = await request(app)
        .post(QUERY_ROUTE)
        .send({
          bankAccountId: null,
        })
        .expect(400);
      expect(body.message).to.contain('bankAccountId is required.');
    });

    it('will error if bank account id is not an int', async () => {
      const { body } = await request(app)
        .post(QUERY_ROUTE)
        .send({
          bankAccountId: 'asdf',
        })
        .expect(400);
      expect(body.message).to.contain('bankAccountId must be an array of integers or an integer.');
    });

    it('will error if bank account id is not a int array', async () => {
      const { body } = await request(app)
        .post(QUERY_ROUTE)
        .send({
          bankAccountId: [1, 2, 'asdf'],
        })
        .expect(400);
      expect(body.message).to.contain('bankAccountId must be an array of integers or an integer.');
    });

    it('will not error if bank account ids is an array of integers', async () => {
      await request(app)
        .post(QUERY_ROUTE)
        .send({
          bankAccountId: [1, 2],
        })
        .expect(200);
    });

    it('will use useMaster=true if use useReadReplica is not set ', async () => {
      const spy = sandbox.spy(DBBankTransaction, 'findAll');
      await request(app)
        .post(QUERY_ROUTE)
        .send({
          bankAccountId: [1, 2],
        })
        .expect(200);
      expect(spy.firstCall.args[0].useMaster).to.eq(true);
    });

    it('will use useMaster=false if use useReadReplica=true ', async () => {
      const spy = sandbox.spy(DBBankTransaction, 'findAll');
      await request(app)
        .post(QUERY_ROUTE)
        .send({
          bankAccountId: [1, 2],
          options: { useReadReplica: true },
        })
        .expect(200);
      expect(spy.firstCall.args[0].useMaster).to.eq(false);
    });

    it('gives a 503 on a sequelize error', async () => {
      sandbox
        .stub(DBBankTransaction, 'findAll')
        .rejects(new SequelizeConnectionError(new Error('no pelicans')));
      await request(app)
        .post(QUERY_ROUTE)
        .send({
          bankAccountId: [1, 2],
          options: { useReadReplica: true },
        })
        .expect(503);
    });
  });

  describe('bank-transactions/count', () => {
    const COUNT_ROUTE = '/services/banking-data/bank-transaction/count';

    it('should fail if bank account id is not an integer', async () => {
      const { body } = await request(app)
        .get(COUNT_ROUTE)
        .query({ bankAccountId: 'asdf' })
        .expect(400);
      expect(body.message).to.contain('bankAccountId must be a valid integer.');
    });

    it('should count the number of bank transactions', async () => {
      const max = Math.floor(Math.random() * 100);
      const bankAccount = await factory.create('bank-account');
      const promises = [];
      for (let i = 0; i < max; i++) {
        promises.push(factory.create('bank-transaction', { bankAccountId: bankAccount.id }));
      }
      await Promise.all(promises);
      const { body } = await request(app)
        .get(COUNT_ROUTE)
        .query({ bankAccountId: bankAccount.id })
        .expect(200);
      expect(body.count).to.eq(max);
    });

    it('will use useMaster=true if use useReadReplica is not set ', async () => {
      const bankAccount = await factory.create('bank-account');
      const spy = sandbox.spy(DBBankTransaction, 'count');
      await request(app)
        .get(COUNT_ROUTE)
        .query({ bankAccountId: bankAccount.id })
        .expect(200);
      expect(spy.firstCall.args[0].useMaster).to.eq(true);
    });

    it('will use useMaster=false if use useReadReplica=true ', async () => {
      const bankAccount = await factory.create('bank-account');
      const spy = sandbox.spy(DBBankTransaction, 'count');
      await request(app)
        .get(COUNT_ROUTE)
        .query({ bankAccountId: bankAccount.id, useReadReplica: true })
        .expect(200);
      expect(spy.firstCall.args[0].useMaster).to.eq(false);
    });
  });

  describe('bank-transactions/replicaLag', () => {
    const REPLICA_LAG_ROUTE = '/services/banking-data/bank-transaction/replica-lag';

    it('should query the replica', async () => {
      const replicaDate = moment().subtract(5, 'seconds');
      const stub = sandbox.stub(sequelize, 'query').resolves([{ created: replicaDate }]);
      const { body } = await request(app)
        .get(REPLICA_LAG_ROUTE)
        .expect(200);
      expect(stub.firstCall.args[1].useMaster).to.eq(false);
      expect(body.replicationLagSeconds).to.be.oneOf([5, 6]);
    });

    it('should use a valid query', async () => {
      const replicaDate = moment().subtract(5, 'seconds');
      await factory.create('bank-transaction', { created: replicaDate });
      const { body } = await request(app)
        .get(REPLICA_LAG_ROUTE)
        .expect(200);
      expect(body.replicationLagSeconds).to.be.oneOf([5, 6]);
    });
  });

  function compareTransactions(expected: any, actual: any) {
    const fields = [
      'bankAccountId',
      'externalId',
      'externalName',
      'amount',
      'transactionDate',
      'pending',
      'plaidCategoryId',
      'pendingExternalName',
      'pendingDisplayName',
      'address',
      'city',
      'state',
      'zipCode',
      'displayName',
    ];
    fields.forEach(field => {
      if (isNil(expected[field])) {
        expect(isNil(actual[field])).to.eq(true);
      } else {
        expect(expected[field]).to.eq(actual[field], `invalid field ${field}`);
      }
    });
  }
});
