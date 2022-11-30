import { expect } from 'chai';
import * as sinon from 'sinon';
import * as request from 'supertest';
import { Moment, moment } from '@dave-inc/time-lib';
import app from '../../../../../src/services/internal-dashboard-api';
import factory from '../../../../factories';
import { clean, withInternalUser, stubBankTransactionClient } from '../../../../test-helpers';
import { BankAccount } from '../../../../../src/models';
import { BankTransaction } from '@dave-inc/wire-typings';

describe('/v2/bank-accounts/:id/bank-transactions', () => {
  const sandbox = sinon.createSandbox();

  before(() => clean());

  let bankAccount: BankAccount;
  let url: string;
  beforeEach(async () => {
    stubBankTransactionClient(sandbox);

    bankAccount = await factory.create<BankAccount>('bank-account');
    url = `/v2/bank-accounts/${bankAccount.id}/bank-transactions`;
  });

  afterEach(() => clean(sandbox));

  it('fetches transactions for the bank account', async () => {
    const [includedTransaction] = await Promise.all([
      factory.create('bank-transaction', {
        userId: bankAccount.userId,
        bankAccountId: bankAccount.id,
      }),
      factory.create('bank-transaction', { userId: bankAccount.userId }),
    ]);

    const {
      body: { data },
    } = await withInternalUser(
      request(app)
        .get(url)
        .expect(200),
    );

    expect(data.length).to.equal(1);

    const {
      id,
      type,
      attributes: { amount, displayName, pending, transactionDate },
    } = data[0];

    expect(type).to.equal('bank-transaction');
    expect(id).to.equal(`${includedTransaction.id}`);
    expect(amount).to.equal(includedTransaction.amount);
    expect(displayName).to.equal(includedTransaction.displayName);
    expect(pending).to.equal(includedTransaction.pending);
    expect(transactionDate).to.equal(includedTransaction.transactionDate);
  });

  it('supports pagination', async () => {
    const [includedTransaction] = await Promise.all([
      factory.create('bank-transaction', {
        userId: bankAccount.userId,
        bankAccountId: bankAccount.id,
        transactionDate: moment()
          .subtract(2, 'days')
          .ymd(),
      }),
      factory.create('bank-transaction', {
        userId: bankAccount.userId,
        bankAccountId: bankAccount.id,
        transactionDate: moment().ymd(),
      }),
    ]);

    const {
      body: { data },
    } = await withInternalUser(
      request(app)
        .get(url)
        .query(`page[limit]=1&page[offset]=1`)
        .expect(200),
    );

    expect(data).to.have.length(1);

    const [{ id }] = data;

    expect(id).to.equal(`${includedTransaction.id}`);
  });

  it('filters by displayName', async () => {
    const [includedTransaction] = await Promise.all([
      factory.create('bank-transaction', {
        userId: bankAccount.userId,
        bankAccountId: bankAccount.id,
        displayName: 'howdy',
      }),
      factory.create('bank-transaction', {
        userId: bankAccount.userId,
        bankAccountId: bankAccount.id,
        displayName: 'dont include me',
      }),
    ]);

    const {
      body: { data },
    } = await withInternalUser(
      request(app)
        .get(url)
        .query(`filter[or][0][displayName][like]=%${includedTransaction.displayName}%`)
        .expect(200),
    );

    expect(data.length).to.equal(1);

    const [{ id }] = data;

    expect(id).to.equal(`${includedTransaction.id}`);
  });

  context('filters by amount', () => {
    it('by expenses', async () => {
      const [includedTransaction] = await Promise.all([
        factory.create('bank-transaction', {
          userId: bankAccount.userId,
          bankAccountId: bankAccount.id,
          amount: -5,
        }),
        factory.create('bank-transaction', {
          userId: bankAccount.userId,
          bankAccountId: bankAccount.id,
          amount: 5,
        }),
      ]);

      const {
        body: { data },
      } = await withInternalUser(
        request(app)
          .get(url)
          .query(`filter[or][0][amount][lte]=0`)
          .expect(200),
      );

      expect(data).to.have.length(1);

      const [{ attributes, id }] = data;

      expect(id).to.equal(`${includedTransaction.id}`);
      expect(attributes.amount).to.be.lessThan(0);
    });

    it('by income', async () => {
      const [includedTransaction] = await Promise.all([
        factory.create('bank-transaction', {
          userId: bankAccount.userId,
          bankAccountId: bankAccount.id,
          amount: 5,
        }),
        factory.create('bank-transaction', {
          userId: bankAccount.userId,
          bankAccountId: bankAccount.id,
          amount: -5,
        }),
      ]);

      const {
        body: { data },
      } = await withInternalUser(
        request(app)
          .get(url)
          .query(`filter[or][0][amount][gte]=0`)
          .expect(200),
      );

      expect(data).to.have.length(1);

      const [{ attributes, id }] = data;

      expect(id).to.equal(`${includedTransaction.id}`);
      expect(attributes.amount).to.be.greaterThan(0);
    });

    it('by range', async () => {
      const [includedTransaction] = await Promise.all([
        factory.create('bank-transaction', {
          userId: bankAccount.userId,
          bankAccountId: bankAccount.id,
          amount: 0,
        }),
        factory.create('bank-transaction', {
          userId: bankAccount.userId,
          bankAccountId: bankAccount.id,
          amount: 5,
        }),
      ]);

      const {
        body: { data },
      } = await withInternalUser(
        request(app)
          .get(url)
          .query(`filter[or][0][amount][lte]=0&filter[or][0][amount][gte]=0`)
          .expect(200),
      );

      expect(data).to.have.length(1);

      const [{ attributes, id }] = data;

      expect(id).to.equal(`${includedTransaction.id}`);
      expect(attributes.amount).to.be.gte(0);
      expect(attributes.amount).to.be.lte(0);
    });
  });

  context('filters by transactionDate', () => {
    it('by end date', async () => {
      const today: Moment = moment();
      const [includedTransaction] = await Promise.all([
        factory.create('bank-transaction', {
          userId: bankAccount.userId,
          bankAccountId: bankAccount.id,
          transactionDate: today
            .clone()
            .subtract(2, 'days')
            .ymd(),
        }),
        factory.create('bank-transaction', {
          userId: bankAccount.userId,
          bankAccountId: bankAccount.id,
          transactionDate: today
            .clone()
            .add(2, 'days')
            .ymd(),
        }),
      ]);

      const {
        body: { data },
      } = await withInternalUser(
        request(app)
          .get(url)
          .query(`filter[or][0][transactionDate][lte]=${today.ymd()}`)
          .expect(200),
      );

      expect(data).to.have.length(1);

      const [{ attributes, id }] = data;

      expect(id).to.equal(`${includedTransaction.id}`);
      expect(moment(attributes.transactionDate).isSameOrBefore(today.ymd())).to.be.true;
    });

    it('by start date', async () => {
      const today: Moment = moment();
      const [includedTransaction] = await Promise.all([
        factory.create('bank-transaction', {
          userId: bankAccount.userId,
          bankAccountId: bankAccount.id,
          transactionDate: today
            .clone()
            .add(2, 'day')
            .ymd(),
        }),
        factory.create('bank-transaction', {
          userId: bankAccount.userId,
          bankAccountId: bankAccount.id,
          transactionDate: today
            .clone()
            .subtract(2, 'day')
            .ymd(),
        }),
      ]);

      const {
        body: { data },
      } = await withInternalUser(
        request(app)
          .get(url)
          .query(`filter[or][0][transactionDate][gte]=${today.ymd()}`)
          .expect(200),
      );

      expect(data).to.have.length(1);

      const [{ attributes, id }] = data;

      expect(id).to.equal(`${includedTransaction.id}`);
      expect(moment(attributes.transactionDate).isSameOrAfter(today.ymd())).to.be.true;
    });

    it('by range', async () => {
      const today: Moment = moment();
      const endDate = today
        .clone()
        .add(4, 'day')
        .ymd();
      const [includedTransaction] = await Promise.all([
        factory.create('bank-transaction', {
          userId: bankAccount.userId,
          bankAccountId: bankAccount.id,
          transactionDate: today
            .clone()
            .add(2, 'day')
            .ymd(),
        }),
        factory.create('bank-transaction', {
          userId: bankAccount.userId,
          bankAccountId: bankAccount.id,
          transactionDate: today
            .clone()
            .add(6, 'day')
            .ymd(),
        }),
      ]);

      const {
        body: { data },
      } = await withInternalUser(
        request(app)
          .get(url)
          .query(
            `filter[or][0][transactionDate][lte]=${endDate}&filter[or][0][transactionDate][gte]=${today.ymd()}`,
          )
          .expect(200),
      );

      expect(data).to.have.length(1);

      const [{ attributes, id }] = data;

      expect(id).to.equal(`${includedTransaction.id}`);
      expect(
        moment(attributes.transactionDate).isSameOrAfter(today) &&
          moment(attributes.transactionDate).isSameOrBefore(endDate),
      ).to.be.true;
    });
  });

  it('filters result by display name or amount', async () => {
    const excludedTransactionName = 'do not include me';
    await Promise.all([
      factory.create('bank-transaction', {
        userId: bankAccount.userId,
        bankAccountId: bankAccount.id,
        displayName: '50',
      }),
      factory.create('bank-transaction', {
        userId: bankAccount.userId,
        bankAccountId: bankAccount.id,
        amount: '50',
      }),
      factory.create('bank-transaction', {
        userId: bankAccount.userId,
        bankAccountId: bankAccount.id,
        displayName: excludedTransactionName,
        amount: '100',
      }),
    ]);

    const {
      body: { data },
    } = await withInternalUser(
      request(app)
        .get(url)
        .query(
          'filter[or][0][displayName][like]=%50%&filter[or][1][amount][in][0]=50&filter[or][1][amount][in][1]=-50',
        )
        .expect(200),
    );

    expect(data.length).to.equal(2);
    expect(
      data.every(
        (transaction: BankTransaction) => transaction.displayName !== excludedTransactionName,
      ),
    ).to.be.true;
  });
});
