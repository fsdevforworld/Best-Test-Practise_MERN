import { BankAccountSubtype, BankAccountType } from '@dave-inc/wire-typings';
import { expect } from 'chai';
import * as sinon from 'sinon';
import * as request from 'supertest';
import app from '../../../src/api';
import * as appsFlyer from '../../../src/lib/appsflyer';
import { BankAccount, BankConnection, BankConnectionTransition, User } from '../../../src/models';
import { Platforms } from '../../../src/typings';
import factory from '../../factories';
import { clean, stubBankTransactionClient, up } from '../../test-helpers';
import { AUTH_SECRET, CLIENT_ID, HASHED_KEY } from './test-constants';

const sandbox = sinon.createSandbox();

describe('POST /internal/dave_banking_connection', () => {
  const internalAuthHeader = `Basic ${Buffer.from(`${CLIENT_ID}:${AUTH_SECRET}`).toString(
    'base64',
  )}`;
  const BANK_OF_DAVE_USER_DAVE_ID = 1783460;

  // insert user and user_session data
  beforeEach(async () => {
    await clean(sandbox);
    stubBankTransactionClient(sandbox);
    await up();
    await factory.create('user', { id: BANK_OF_DAVE_USER_DAVE_ID });

    sandbox.stub(appsFlyer, 'logAppsflyerEvent');
  });

  //truncate user and user_session data
  after(() => clean(sandbox));

  it('should not accept the hashed version of the key', async () => {
    const authHeader = `Basic ${Buffer.from(`${CLIENT_ID}:${HASHED_KEY}`).toString('base64')}`;

    await request(app)
      .post('/internal/dave_banking_connection')
      .send({
        daveUserId: BANK_OF_DAVE_USER_DAVE_ID,
        bankAccountId: 'test-bank-account-id',
        lastFour: '1234',
        displayName: 'My display name',
        currentBalance: 100,
        availableBalance: 120,
        type: BankAccountType.Depository,
        subtype: BankAccountSubtype.Checking,
        ipAddress: '127.0.0.1',
      })
      .set('Authorization', authHeader)
      .expect(403);
  });

  context('when a bank account already exists', () => {
    const expectedBankAccountExternalId: string = '123456FGH';

    beforeEach(async () => {
      const bankConnection = await factory.create<BankConnection>('bank-of-dave-bank-connection', {
        userId: BANK_OF_DAVE_USER_DAVE_ID,
      });
      await factory.create<BankAccount>('bod-checking-account', {
        externalId: expectedBankAccountExternalId,
        userId: BANK_OF_DAVE_USER_DAVE_ID,
        bankConnectionId: bankConnection.id,
      });
    });

    it('should not create new account if already created', async () => {
      await request(app)
        .post('/internal/dave_banking_connection')
        .send({
          daveUserId: BANK_OF_DAVE_USER_DAVE_ID,
          bankAccountId: expectedBankAccountExternalId,
          lastFour: '1234',
          displayName: 'My display name',
          currentBalance: 100,
          availableBalance: 120,
          type: BankAccountType.Depository,
          subtype: BankAccountSubtype.Checking,
          ipAddress: '127.0.0.1',
        })
        .set('Authorization', internalAuthHeader)
        .expect(200);

      const bankAccounts = await BankAccount.findAll({
        where: {
          userId: BANK_OF_DAVE_USER_DAVE_ID,
          externalId: expectedBankAccountExternalId,
        },
      });

      expect(bankAccounts.length).to.equal(1);
    });
  });

  context('when a bank connection already exists', () => {
    let bankConnection: BankConnection;

    beforeEach(async () => {
      bankConnection = await factory.create<BankConnection>('bank-of-dave-bank-connection', {
        userId: BANK_OF_DAVE_USER_DAVE_ID,
      });
      await factory.create('bank-connection-transition', {
        fromBankConnectionId: bankConnection.id,
        toBankConnectionId: bankConnection.id,
      });
    });

    it('should not create new connection if already created', async () => {
      await request(app)
        .post('/internal/dave_banking_connection')
        .send({
          daveUserId: BANK_OF_DAVE_USER_DAVE_ID,
          bankAccountId: 'test-bank-account-id',
          lastFour: '1234',
          displayName: 'My display name',
          currentBalance: 100,
          availableBalance: 120,
          type: BankAccountType.Depository,
          subtype: BankAccountSubtype.Checking,
          ipAddress: '127.0.0.1',
        })
        .set('Authorization', internalAuthHeader)
        .expect(200);

      const bankConnections = await BankConnection.findAll({
        where: {
          userId: BANK_OF_DAVE_USER_DAVE_ID,
        },
      });

      expect(bankConnections.length).to.equal(1);
      expect(await bankConnections[0].getToBankConnectionTransitions()).to.have.lengthOf(1);
    });

    it('should not try to create a duplicate bank connection transition', async () => {
      const bankAccount = await factory.create<BankAccount>('bank-account', {
        bankConnectionId: bankConnection.id,
        userId: BANK_OF_DAVE_USER_DAVE_ID,
      });

      await User.update(
        { defaultBankAccountId: bankAccount.id },
        { where: { id: BANK_OF_DAVE_USER_DAVE_ID } },
      );

      await request(app)
        .post('/internal/dave_banking_connection')
        .send({
          daveUserId: BANK_OF_DAVE_USER_DAVE_ID,
          bankAccountId: 'test-bank-account-id',
          lastFour: '1234',
          displayName: 'My display name',
          currentBalance: 100,
          availableBalance: 120,
          type: BankAccountType.Depository,
          subtype: BankAccountSubtype.Checking,
          ipAddress: '127.0.0.1',
        })
        .set('Authorization', internalAuthHeader)
        .expect(200);

      const bankConnections = await BankConnection.findAll({
        where: {
          userId: BANK_OF_DAVE_USER_DAVE_ID,
        },
      });
      expect(bankConnections.length).to.equal(1);
      expect(await bankConnections[0].getToBankConnectionTransitions()).to.have.lengthOf(1);
    });

    it('should add an additional account to an existing connection', async () => {
      await factory.create<BankAccount>('bod-checking-account', {
        externalId: 'existing-external-id',
        userId: BANK_OF_DAVE_USER_DAVE_ID,
        bankConnectionId: bankConnection.id,
      });

      const { body } = await request(app)
        .post('/internal/dave_banking_connection')
        .send({
          daveUserId: BANK_OF_DAVE_USER_DAVE_ID,
          bankAccountId: 'savings-bank-account-id',
          lastFour: '1234',
          displayName: 'My display name',
          currentBalance: 100,
          availableBalance: 120,
          type: BankAccountType.Depository,
          subtype: BankAccountSubtype.Savings,
          ipAddress: '127.0.0.1',
        })
        .set('Authorization', internalAuthHeader)
        .expect(200);

      expect(body).to.include({
        externalId: 'savings-bank-account-id',
        microDeposit: 'COMPLETED',
        bankConnectionId: bankConnection.id,
        displayName: 'My display name',
        lastFour: '1234',
      });

      const bankConnections = await BankConnection.findAll({
        include: [BankAccount, BankConnectionTransition],
        where: {
          userId: BANK_OF_DAVE_USER_DAVE_ID,
        },
      });

      expect(bankConnections.length).to.equal(1);

      const [connection] = bankConnections;
      expect(connection.toBankConnectionTransitions).to.have.lengthOf(1);

      expect(connection.bankAccounts).to.have.lengthOf(2);
      expect(connection.bankAccounts.map(({ id, subtype }) => ({ id, subtype }))).to.deep.include({
        id: body.id,
        subtype: BankAccountSubtype.Savings,
      });

      // no appsflyer events for savings accounts
      expect(appsFlyer.logAppsflyerEvent).not.to.have.been.called;

      // default account shouldn't update for savings
      const user = await User.findByPk(BANK_OF_DAVE_USER_DAVE_ID);
      expect(user.defaultBankAccountId).not.to.equal(body.id);
    });
  });

  it('should create a bank connection for dave banking v2', async () => {
    const expectedIpAddress = '192.34.23.111';
    const expectedAppsflyerDeviceId = 'fake-apps-flyer-device-id';
    const expectedPlatform = Platforms.iOS;

    const { body } = await request(app)
      .post('/internal/dave_banking_connection')
      .send({
        daveUserId: BANK_OF_DAVE_USER_DAVE_ID,
        bankAccountId: 'test-bank-account-id',
        lastFour: '1234',
        displayName: 'My display name',
        currentBalance: 100,
        availableBalance: 120,
        type: BankAccountType.Depository,
        subtype: BankAccountSubtype.Checking,
        ipAddress: expectedIpAddress,
        appsflyerDeviceId: expectedAppsflyerDeviceId,
        platform: expectedPlatform,
      })
      .set('Authorization', internalAuthHeader)
      .expect(200);

    const result = body;

    expect(result.displayName).to.equal('My display name');
    expect(result.lastFour).to.equal('1234');
    expect(result.hasAccountRouting).to.equal(false);
    expect(result.microDeposit).to.equal('COMPLETED');
    expect(result.available).to.equal(120);
    expect(result.current).to.equal(100);
    expect(result.institution.displayName).to.equal('Bank of Dave');
    expect(result.bankingDataSource).to.equal('BANK_OF_DAVE');

    expect(appsFlyer.logAppsflyerEvent).to.have.been.calledWith({
      userId: BANK_OF_DAVE_USER_DAVE_ID,
      ip: expectedIpAddress,
      appsflyerDeviceId: expectedAppsflyerDeviceId,
      platform: expectedPlatform,
      eventName: appsFlyer.AppsFlyerEvents.DAVE_CHECKING_ACCOUNT_READY,
    });
    expect(appsFlyer.logAppsflyerEvent).to.have.been.calledWith({
      userId: BANK_OF_DAVE_USER_DAVE_ID,
      ip: expectedIpAddress,
      appsflyerDeviceId: expectedAppsflyerDeviceId,
      platform: expectedPlatform,
      eventName: appsFlyer.AppsFlyerEvents.ONE_DAVE_CONVERSION,
      eventValue: 'checking account created',
    });
  });

  it('should be idempotent', async () => {
    await request(app)
      .post('/internal/dave_banking_connection')
      .send({
        daveUserId: BANK_OF_DAVE_USER_DAVE_ID,
        bankAccountId: 'test-bank-account-id',
        lastFour: '1234',
        displayName: 'My display name',
        currentBalance: 100,
        availableBalance: 120,
        type: BankAccountType.Depository,
        subtype: BankAccountSubtype.Checking,
        ipAddress: '127.0.0.1',
      })
      .set('Authorization', internalAuthHeader)
      .expect(200);

    await request(app)
      .post('/internal/dave_banking_connection')
      .send({
        daveUserId: BANK_OF_DAVE_USER_DAVE_ID,
        bankAccountId: 'test-bank-account-id',
        lastFour: '1234',
        displayName: 'My display name',
        currentBalance: 100,
        availableBalance: 120,
        type: BankAccountType.Depository,
        subtype: BankAccountSubtype.Checking,
        ipAddress: '127.0.0.1',
      })
      .set('Authorization', internalAuthHeader)
      .expect(200);

    await request(app)
      .post('/internal/dave_banking_connection')
      .send({
        daveUserId: BANK_OF_DAVE_USER_DAVE_ID,
        bankAccountId: 'test-bank-account-id',
        lastFour: '1234',
        displayName: 'My display name',
        currentBalance: 100,
        availableBalance: 120,
        type: BankAccountType.Depository,
        subtype: BankAccountSubtype.Checking,
        ipAddress: '127.0.0.1',
      })
      .set('Authorization', internalAuthHeader)
      .expect(200);

    const bankConnections = await BankConnection.findAll({
      where: {
        userId: BANK_OF_DAVE_USER_DAVE_ID,
      },
    });

    const bankAccounts = await BankAccount.findAll({
      where: {
        userId: BANK_OF_DAVE_USER_DAVE_ID,
      },
    });

    expect(appsFlyer.logAppsflyerEvent).to.have.been.calledTwice;

    expect(bankConnections.length).to.be.equal(1);
    expect(bankAccounts.length).to.be.equal(1);
  });
});
