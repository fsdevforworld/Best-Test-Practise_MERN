import * as request from 'supertest';
import { clean, replayHttp, withInternalUser } from '../../../../../test-helpers';
import { BankAccount, User } from '../../../../../../src/models';
import app from '../../../../../../src/services/internal-dashboard-api';
import factory from '../../../../../factories';
import { expect } from 'chai';
import { moment } from '@dave-inc/time-lib';

const fixturePath = 'services/internal-dashboard-api/v2/users/get-recurring-goals-transfers';

/**
 * Since you can only have one recurring transfer per goal account as of 03.31.21, I had to add the ACH transfer, record
 * the fixture, delete it, then add the intrabank transfer and record that fixture. If you need to rerecord any of these
 * Goals api calls, you will need to do the same.
 *
 * Because we are using data from their staging DB, it's subject to change, which is why I did not bother setting up two
 * different users/accounts, one with ach and one with intrabank.
 */
describe('GET /v2/users/:id/recurring-goals-transfers', () => {
  before(() => clean());
  afterEach(() => clean());

  it(
    'fetches recurring ach transfer',
    replayHttp(`${fixturePath}/ach.json`, async () => {
      const user = await factory.create<User>('user', { id: 3680 });

      const {
        body: { data },
      } = await withInternalUser(
        request(app)
          .get(`/v2/users/${user.id}/recurring-goals-transfers`)
          .expect(200),
      );

      const [transfer] = data;
      const {
        attributes,
        relationships: { fundingSource, goal },
      } = transfer;

      expect(transfer.type).to.equal('recurring-transfer');
      expect(attributes.amount).to.equal(10);
      expect(attributes.interval).to.equal('weekly');
      expect(attributes.intervalParams).to.contain('friday');
      expect(attributes.nextScheduledOn).to.equal('2021-04-02');

      expect(fundingSource.data.type).to.equal('bank-account');
      // Hard coded because I'm using a staging user to record fixtures
      expect(fundingSource.data.id).to.equal('14962');

      expect(goal.data.type).to.equal('goal');
      expect(goal.data.id).to.equal('34b51e705aa911ebb6b9fbdaaa3455fa');
    }),
  );

  it(
    'fetches recurring intrabank transfer',
    replayHttp(`${fixturePath}/intrabank.json`, async () => {
      const user = await factory.create<User>('user', { id: 3680 });
      const bankAccount = await factory.create<BankAccount>('bank-account', {
        userId: 3680,
        externalId: '62500071978946f6bd038e85c737f0c8',
      });

      await bankAccount.reload();

      const {
        body: { data },
      } = await withInternalUser(
        request(app)
          .get(`/v2/users/${user.id}/recurring-goals-transfers`)
          .expect(200),
      );

      const [transfer] = data;
      const {
        attributes,
        relationships: { fundingSource },
      } = transfer;

      expect(transfer.type).to.equal('recurring-transfer');
      expect(attributes.amount).to.equal(10);
      expect(attributes.interval).to.equal('weekly');
      expect(attributes.intervalParams).to.contain('friday');
      expect(attributes.nextScheduledOn).to.equal('2021-04-02');

      expect(fundingSource.data.type).to.equal('bank-account');
      expect(fundingSource.data.id).to.equal(bankAccount.id.toString());
    }),
  );

  it(
    'fetches recurring intrabank transfer -- deleted bank account',
    replayHttp(`${fixturePath}/intrabank-deleted.json`, async () => {
      const user = await factory.create<User>('user', { id: 3680 });
      const bankAccount = await factory.create<BankAccount>('bank-account', {
        userId: 3680,
        externalId: '62500071978946f6bd038e85c737f0c8',
        deleted: moment(),
      });

      await bankAccount.reload({ paranoid: false });

      const {
        body: { data },
      } = await withInternalUser(
        request(app)
          .get(`/v2/users/${user.id}/recurring-goals-transfers`)
          .expect(200),
      );

      const [transfer] = data;
      const {
        relationships: { fundingSource },
      } = transfer;

      expect(fundingSource.data.type).to.equal('bank-account');
      expect(fundingSource.data.id).to.equal(bankAccount.id.toString());
    }),
  );

  it(
    'fetches recurring intrabank transfer',
    replayHttp(`${fixturePath}/intrabank.json`, async () => {
      const user = await factory.create<User>('user', { id: 3680 });
      const bankAccount = await factory.create<BankAccount>('bank-account', {
        userId: 3680,
        externalId: '62500071978946f6bd038e85c737f0c8',
      });

      await bankAccount.reload();

      const {
        body: { data },
      } = await withInternalUser(
        request(app)
          .get(`/v2/users/${user.id}/recurring-goals-transfers`)
          .expect(200),
      );

      const [transfer] = data;
      const {
        attributes,
        relationships: { fundingSource },
      } = transfer;

      expect(transfer.type).to.equal('recurring-transfer');
      expect(attributes.amount).to.equal(10);
      expect(attributes.interval).to.equal('weekly');
      expect(attributes.intervalParams).to.contain('friday');
      expect(attributes.nextScheduledOn).to.equal('2021-04-02');

      expect(fundingSource.data.type).to.equal('bank-account');
      expect(fundingSource.data.id).to.equal(bankAccount.id.toString());
    }),
  );

  it(
    'provides null fundingSource relationship when bank account does not exist',
    replayHttp(`${fixturePath}/intrabank.json`, async () => {
      const user = await factory.create<User>('user', { id: 3680 });

      const {
        body: { data },
      } = await withInternalUser(
        request(app)
          .get(`/v2/users/${user.id}/recurring-goals-transfers`)
          .expect(200),
      );

      const [transfer] = data;
      const {
        attributes,
        relationships: { fundingSource },
      } = transfer;

      expect(transfer.type).to.equal('recurring-transfer');
      expect(attributes.amount).to.equal(10);
      expect(attributes.interval).to.equal('weekly');
      expect(attributes.intervalParams).to.contain('friday');
      expect(attributes.nextScheduledOn).to.equal('2021-04-02');

      expect(fundingSource.data).to.be.null;
    }),
  );

  it(
    'returns an empty list if account has no associated recurring transfers',
    replayHttp(`${fixturePath}/no-transfers.json`, async () => {
      const user = await factory.create<User>('user', { id: 3680 });

      const {
        body: { data },
      } = await withInternalUser(
        request(app)
          .get(`/v2/users/${user.id}/recurring-goals-transfers`)
          .expect(200),
      );

      expect(data).to.have.length(0);
    }),
  );

  it(
    'returns an empty list if user id is not associated with a goals account',
    replayHttp(`${fixturePath}/403.json`, async () => {
      const user = await factory.create<User>('user', { id: 3681 });

      const {
        body: { data },
      } = await withInternalUser(
        request(app)
          .get(`/v2/users/${user.id}/recurring-goals-transfers`)
          .expect(200),
      );

      expect(data).to.have.length(0);
    }),
  );
});
