import { expect } from 'chai';
import { moment } from '@dave-inc/time-lib';
import * as request from 'supertest';
import { serializeDate } from '../../../../../src/serialization';
import { BankAccount, BankConnection, Institution, User } from '../../../../../src/models';
import app from '../../../../../src/services/internal-dashboard-api';
import factory from '../../../../factories';
import { clean, withInternalUser } from '../../../../test-helpers';
import { BankAccountType } from '@dave-inc/wire-typings';

describe('GET /v2/users/:id/bank-accounts', () => {
  before(() => clean());

  afterEach(() => clean());

  let user: User;
  let institution: Institution;
  let bankConnection: BankConnection;
  let req: request.Test;

  beforeEach(async () => {
    user = await factory.create<User>('user');

    institution = await factory.create('institution', { logo: 'logo', displayName: 'Dave' });

    bankConnection = await factory.create<BankConnection>('bank-connection', {
      userId: user.id,
      institutionId: institution.id,
      hasValidCredentials: true,
    });

    req = request(app)
      .get(`/v2/users/${user.id}/bank-accounts`)
      .expect(200);
  });

  it('responds with all bank accounts for user, including deleted, excluding non-depository', async () => {
    await Promise.all([
      factory.create<BankAccount>('bank-account', {
        userId: user.id,
        bankConnectionId: bankConnection.id,
      }),
      factory.create<BankAccount>('bank-account', {
        userId: user.id,
        bankConnectionId: bankConnection.id,
        deleted: moment(),
      }),
      factory.create<BankAccount>('bank-account', {
        userId: user.id + 1,
        bankConnectionId: bankConnection.id,
      }),
      factory.create<BankAccount>('bank-account', {
        userId: user.id,
        bankConnectionId: bankConnection.id,
        type: BankAccountType.Credit,
      }),
    ]);

    const {
      body: { data },
    } = await withInternalUser(req);

    expect(data).to.have.length(2);
  });

  it('responds with data as a list of serialized bank accounts', async () => {
    const bankAccount = await factory.create<BankAccount>('bank-account', {
      userId: user.id,
      bankConnectionId: bankConnection.id,
    });

    const {
      body: {
        data: [res],
      },
    } = await withInternalUser(req);

    const { created, updated, deleted } = await bankAccount.reload();

    expect(res.type).to.equal('bank-account');
    expect(res.id).to.equal(`${bankAccount.id}`);
    expect(res.attributes).to.deep.equal({
      available: bankAccount.available,
      isDefaultForUser: false,
      created: serializeDate(created),
      current: bankAccount.current,
      deleted: serializeDate(deleted),
      displayName: bankAccount.displayName,
      externalId: bankAccount.externalId,
      lastFour: bankAccount.lastFour,
      microDeposit: bankAccount.microDeposit,
      microDepositCreated: bankAccount.microDepositCreated,
      subtype: bankAccount.subtype,
      synapseNodeId: bankAccount.synapseNodeId,
      type: bankAccount.type,
      updated: serializeDate(updated),
    });

    await user.update({ defaultBankAccountId: bankAccount.id });

    const requestAfterSettingDefault = request(app)
      .get(`/v2/users/${user.id}/bank-accounts`)
      .expect(200);

    const {
      body: {
        data: [resWithDefault],
      },
    } = await withInternalUser(requestAfterSettingDefault);

    expect(resWithDefault.attributes.isDefaultForUser).to.be.true;
  });

  it('responds with included bank connections', async () => {
    await factory.create<BankAccount>('bank-account', {
      userId: user.id,
      bankConnectionId: bankConnection.id,
    });

    const {
      body: {
        included: [responseConnection],
      },
    } = await withInternalUser(req);

    const { created, deleted } = await bankConnection.reload();

    expect(responseConnection.type).to.equal('bank-connection');
    expect(responseConnection.id).to.equal(`${bankConnection.id}`);
    expect(responseConnection.attributes).to.deep.equal({
      created: serializeDate(created),
      deleted: serializeDate(deleted),
      hasValidCredentials: bankConnection.hasValidCredentials,
      bankingDataSource: bankConnection.bankingDataSource,
      bankingDataSourceErrorAt: null,
      bankingDataSourceErrorCode: null,
      lastPull: serializeDate(bankConnection.lastPull),
      initialPull: serializeDate(bankConnection.initialPull),
      historicalPull: serializeDate(bankConnection.historicalPull),
      externalId: bankConnection.externalId,
      institutionLogo: institution.logo,
      institutionName: institution.displayName,
      canBeArchived: true,
    });
  });

  it('responds with primary payment method relationship', async () => {
    await factory.create<BankAccount>('bank-account', {
      defaultPaymentMethodId: 1,
      userId: user.id,
      bankConnectionId: bankConnection.id,
    });

    const {
      body: {
        data: [bankAccount],
      },
    } = await withInternalUser(req);

    const { primaryPaymentMethod } = bankAccount.relationships;

    expect(primaryPaymentMethod.data.type).to.equal('payment-method');
    expect(primaryPaymentMethod.data.id).to.equal('DEBIT:1');
  });
});
