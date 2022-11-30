import { BankingDataSource } from '@dave-inc/wire-typings';
import { expect } from 'chai';
import * as sinon from 'sinon';
import * as request from 'supertest';

import factory from '../../factories';
import { clean, stubBankTransactionClient } from '../../test-helpers';

import app from '../../../src/api';
import { CUSTOM_ERROR_CODES } from '../../../src/lib/error';
import mxClient from '../../../src/lib/mx';
import * as utils from '../../../src/lib/utils';
import { AuditLog, BankConnection, User, UserSession } from '../../../src/models';
import { MxConnectionStatus, MxMemberStatus } from '../../../src/typings';
import { MxIntegration } from '../../../src/domain/banking-data-source';

describe('/v2/bank_connection MX', () => {
  const sandbox = sinon.createSandbox();

  beforeEach(() => {
    stubBankTransactionClient(sandbox);
  });

  afterEach(() => clean(sandbox));

  it('should throw a 400 when mx member guid is not provided', async () => {
    const userSession = await factory.create<UserSession>('user-session');

    await request(app)
      .post('/v2/bank_connection')
      .send({ source: BankingDataSource.Mx })
      .set('Authorization', userSession.token)
      .set('X-Device-Id', userSession.deviceId)
      .expect(400);
  });

  it('should throw a generic error if mx api errors out', async () => {
    const user = await factory.create<User>('user', {
      mxUserId: 'fake-mx-user-guid',
    });
    const userSession = await factory.create<UserSession>('user-session', {
      userId: user.id,
    });
    const mxMemberGuid = 'fake-mx-member-guid';
    const deleteNexusSpy = sandbox.spy(MxIntegration.prototype, 'deleteNexus');

    sandbox
      .stub(mxClient.members, 'readMember')
      .withArgs(mxMemberGuid, user.mxUserId)
      .throws(new Error('MX NOT GOOD'));

    const result = await request(app)
      .post('/v2/bank_connection')
      .send({ mxMemberGuid, source: BankingDataSource.Mx })
      .set('Authorization', userSession.token)
      .set('X-Device-Id', userSession.deviceId)
      .expect(500);

    expect(result.body.message).to.include('Oops, error! Send us this ID if you need help:');

    sinon.assert.called(deleteNexusSpy);
  });

  it('should throw unsupported error if no bank accounts are supported', async () => {
    const user = await factory.create<User>('user', {
      mxUserId: 'fake-mx-user-guid',
    });
    const userSession = await factory.create<UserSession>('user-session', {
      userId: user.id,
    });
    const mxMemberGuid = 'fake-mx-member-guid';
    const mxInstitution = {
      code: 'fake-mx-institution-code',
      name: 'Fake Bank',
      mediumLogoUrl: 'fake-logo-url',
    };
    const mxMember = {
      guid: mxMemberGuid,
      institutionCode: mxInstitution.code,
    };
    const mxMemberStatus = {
      guid: mxMemberGuid,
      isBeingAggregated: false,
    };
    const unsupportedMxMemberAccounts = [
      {
        availableBalance: 3000.0,
        balance: 3000.0,
        guid: 'ACT-06sdff44db-caae-0f6e-1383-0sdfddscb1',
        member_guid: mxMemberGuid,
        name: 'Test Saving Account 1',
        type: 'SAVINGS',
        user_guid: user.mxUserId,
      },
      {
        availableBalance: 3000.0,
        balance: 3000.0,
        guid: 'ACT-06sgdsdb-caae-0f6e-1383-0sdfddscb1',
        member_guid: mxMemberGuid,
        name: 'Test Credit Card Account 1',
        type: 'CREDIT_CARD',
        user_guid: user.mxUserId,
      },
      {
        availableBalance: 3000.0,
        balance: 3000.0,
        guid: 'ACT-06sdfdsdb-caae-0f6e-1383-0sdfddscb1',
        member_guid: mxMemberGuid,
        name: 'Test Loan Account 1',
        type: 'LOAN',
        user_guid: user.mxUserId,
      },
    ];

    sandbox
      .stub(mxClient.members, 'readMember')
      .withArgs(mxMemberGuid, user.mxUserId)
      .returns({ body: { member: mxMember } });
    sandbox
      .stub(mxClient.members, 'readMemberStatus')
      .withArgs(mxMemberGuid, user.mxUserId)
      .returns({ body: { member: mxMemberStatus } });
    sandbox
      .stub(mxClient.institutions, 'readInstitution')
      .withArgs(mxInstitution.code)
      .returns({ body: { institution: mxInstitution } });
    sandbox
      .stub(mxClient.members, 'listMemberAccounts')
      .withArgs(mxMemberGuid, user.mxUserId)
      .returns({ body: { accounts: unsupportedMxMemberAccounts } });
    sandbox
      .stub(mxClient.verification, 'listAccountNumbers')
      .withArgs(mxMemberGuid, user.mxUserId)
      .returns({ body: { accountNumbers: [] } });
    sandbox.stub(utils, 'downloadImageAndBase64Encode').returns('fake-base-64-encoded');

    await request(app)
      .post('/v2/bank_connection')
      .send({ mxMemberGuid, source: BankingDataSource.Mx })
      .set('Authorization', userSession.token)
      .set('X-Device-Id', userSession.deviceId)
      .expect(422);
  });

  it('should throw a custom error if MFA required after fetching account and routing', async () => {
    const user = await factory.create<User>('user', {
      mxUserId: 'fake-mx-user-guid',
    });
    const userSession = await factory.create<UserSession>('user-session', {
      userId: user.id,
    });
    const mxMemberGuid = 'fake-mx-member-guid';
    const mxInstitution = {
      code: 'fake-mx-institution-code',
      name: 'Fake Bank',
      mediumLogoUrl: 'fake-logo-url',
    };
    const mxMember = {
      guid: mxMemberGuid,
      institutionCode: mxInstitution.code,
    };
    const mxMemberAccounts = [
      {
        availableBalance: 1000.0,
        balance: 1000.0,
        guid: 'ACT-06d7f44b-caae-0f6e-1383-01f52e75dcb1',
        member_guid: mxMemberGuid,
        name: 'Test Checking Account 1',
        type: 'CHECKING',
        user_guid: user.mxUserId,
      },
      {
        availableBalance: 2000.0,
        balance: 2000.0,
        guid: 'ACT-06sdfsdf44b-caae-0f6e-1383-01fsdfdcb1',
        member_guid: mxMemberGuid,
        name: 'Test Checking Account 2',
        type: 'CHECKING',
        user_guid: user.mxUserId,
      },
      {
        availableBalance: 3000.0,
        balance: 3000.0,
        guid: 'ACT-06sdff44db-caae-0f6e-1383-0sdfddscb1',
        member_guid: mxMemberGuid,
        name: 'Test Saving Account 1',
        type: 'SAVINGS',
        user_guid: user.mxUserId,
      },
    ];

    sandbox
      .stub(utils, 'downloadImageAndBase64Encode')
      .withArgs(mxInstitution.mediumLogoUrl)
      .returns('fake-base-64-encoded');
    sandbox
      .stub(mxClient.members, 'readMember')
      .withArgs(mxMemberGuid, user.mxUserId)
      .returns({ body: { member: mxMember } });
    sandbox
      .stub(mxClient.institutions, 'readInstitution')
      .withArgs(mxInstitution.code)
      .returns({ body: { institution: mxInstitution } });
    sandbox
      .stub(mxClient.members, 'listMemberAccounts')
      .withArgs(mxMemberGuid, user.mxUserId)
      .returns({ body: { accounts: mxMemberAccounts } });
    sandbox
      .stub(mxClient.verification, 'verifyMember')
      .withArgs(mxMemberGuid, user.mxUserId)
      .returns({ body: { member: { status: MxMemberStatus.Initiated, isBeingAggregated: true } } });
    sandbox
      .stub(mxClient.members, 'readMemberStatus')
      .withArgs(mxMemberGuid, user.mxUserId)
      .onFirstCall()
      .returns({
        body: {
          member: {
            connectionStatus: MxConnectionStatus.Connected,
            isBeingAggregated: false,
            hasProcessedAccounts: true,
          },
        },
      })
      .onSecondCall()
      .returns({
        body: {
          member: {
            connectionStatus: MxConnectionStatus.Connected,
            isBeingAggregated: false,
          },
        },
      })
      .returns({
        body: {
          member: {
            connectionStatus: MxConnectionStatus.Challenged,
            isBeingAggregated: true,
          },
        },
      });

    const result = await request(app)
      .post('/v2/bank_connection')
      .send({ mxMemberGuid, source: BankingDataSource.Mx })
      .set('Authorization', userSession.token)
      .set('X-Device-Id', userSession.deviceId)
      .expect(449);

    expect(result.body.customCode).to.equal(
      CUSTOM_ERROR_CODES.BANK_CONNECTION_DATA_SOURCE_LOGIN_REQUIRED,
    );
  });

  it('should successfully create an mx bank connection', async () => {
    const user = await factory.create<User>('user', {
      mxUserId: 'fake-mx-user-guid',
    });
    const userSession = await factory.create<UserSession>('user-session', {
      userId: user.id,
    });
    const mxMemberGuid = 'fake-mx-member-guid';
    const mxInstitution = {
      code: 'fake-mx-institution-code',
      name: 'Fake Bank',
      mediumLogoUrl: 'fake-logo-url',
    };
    const mxMember = {
      guid: mxMemberGuid,
      institutionCode: mxInstitution.code,
    };
    const mxMemberAccounts = [
      {
        availableBalance: 1000.0,
        balance: 1000.0,
        guid: 'ACT-06d7f44b-caae-0f6e-1383-01f52e75dcb1',
        member_guid: mxMemberGuid,
        name: 'Test Checking Account 1',
        type: 'CHECKING',
        user_guid: user.mxUserId,
      },
      {
        availableBalance: 2000.0,
        balance: 2000.0,
        guid: 'ACT-06sdfsdf44b-caae-0f6e-1383-01fsdfdcb1',
        member_guid: mxMemberGuid,
        name: 'Test Checking Account 2',
        type: 'CHECKING',
        user_guid: user.mxUserId,
      },
      {
        availableBalance: 3000.0,
        balance: 3000.0,
        guid: 'ACT-06sdff44db-caae-0f6e-1383-0sdfddscb1',
        member_guid: mxMemberGuid,
        name: 'Test Saving Account 1',
        type: 'SAVINGS',
        user_guid: user.mxUserId,
      },
    ];
    const mxMemberAccountNumbers = mxMemberAccounts.map((account, index) => ({
      accountGuid: account.guid,
      accountNumber: `${account.guid}-fake-account-${index}`,
      routingNumber: `${account.guid}-fake-routing-${index}`,
      memberGuid: account.member_guid,
      userGuid: account.user_guid,
    }));

    sandbox
      .stub(mxClient.members, 'readMember')
      .withArgs(mxMemberGuid, user.mxUserId)
      .returns({ body: { member: mxMember } });
    sandbox
      .stub(mxClient.institutions, 'readInstitution')
      .withArgs(mxInstitution.code)
      .returns({ body: { institution: mxInstitution } });
    sandbox
      .stub(mxClient.members, 'listMemberAccounts')
      .withArgs(mxMemberGuid, user.mxUserId)
      .returns({ body: { accounts: mxMemberAccounts } });
    sandbox
      .stub(mxClient.verification, 'verifyMember')
      .withArgs(mxMemberGuid, user.mxUserId)
      .returns({ body: { member: { status: MxMemberStatus.Initiated, isBeingAggregated: true } } });
    sandbox
      .stub(mxClient.members, 'readMemberStatus')
      .withArgs(mxMemberGuid, user.mxUserId)
      .returns({
        body: {
          member: {
            connectionStatus: MxConnectionStatus.Connected,
            isBeingAggregated: false,
            hasProcessedAccounts: true,
          },
        },
      });
    sandbox
      .stub(mxClient.verification, 'listAccountNumbers')
      .withArgs(mxMemberGuid, user.mxUserId)
      .returns({ body: { accountNumbers: mxMemberAccountNumbers } });
    sandbox
      .stub(utils, 'downloadImageAndBase64Encode')
      .withArgs(mxInstitution.mediumLogoUrl)
      .returns('fake-base-64-encoded');

    await request(app)
      .post('/v2/bank_connection')
      .send({ mxMemberGuid, source: BankingDataSource.Mx })
      .set('Authorization', userSession.token)
      .set('X-Device-Id', userSession.deviceId)
      .expect(200);

    const bankConnections = await BankConnection.findAll({ where: { userId: user.id } });

    expect(bankConnections).to.have.length(1);

    const bankConnection = bankConnections[0];
    const bankAccounts = await bankConnection.getBankAccounts();

    expect(bankConnection).to.include({
      bankingDataSource: BankingDataSource.Mx,
      hasValidCredentials: true,
      externalId: mxMemberGuid,
      authToken: mxMemberGuid,
    });
    expect(bankAccounts).to.have.length(2);
    expect(bankAccounts[0]).to.include({
      bankConnectionId: bankConnection.id,
      userId: user.id,
      available: 1000,
      current: 1000,
      externalId: 'ACT-06d7f44b-caae-0f6e-1383-01f52e75dcb1',
      displayName: 'Test Checking Account 1',
      type: 'DEPOSITORY',
      subtype: 'CHECKING',
    });
    expect(bankAccounts[0].accountNumber).to.exist;
    expect(bankAccounts[1]).to.include({
      bankConnectionId: bankConnection.id,
      userId: user.id,
      available: 2000,
      current: 2000,
      externalId: 'ACT-06sdfsdf44b-caae-0f6e-1383-01fsdfdcb1',
      displayName: 'Test Checking Account 2',
      type: 'DEPOSITORY',
      subtype: 'CHECKING',
    });
    expect(bankAccounts[1].accountNumber).to.exist;
  });

  it('should successfully fallback to micro-deposits if members institution does not support account verification', async () => {
    const user = await factory.create<User>('user', {
      mxUserId: 'fake-mx-user-guid',
    });
    const userSession = await factory.create<UserSession>('user-session', {
      userId: user.id,
    });
    const mxMemberGuid = 'fake-mx-member-guid';
    const mxInstitution = {
      code: 'fake-mx-institution-code',
      name: 'Fake Bank',
      mediumLogoUrl: 'fake-logo-url',
    };
    const mxMember = {
      guid: mxMemberGuid,
      institutionCode: mxInstitution.code,
    };
    const mxMemberAccounts = [
      {
        availableBalance: 1000.0,
        balance: 1000.0,
        guid: 'ACT-06d7f44b-caae-0f6e-1383-01f52e75dcb1',
        member_guid: mxMemberGuid,
        name: 'Test Checking Account 1',
        type: 'CHECKING',
        user_guid: user.mxUserId,
      },
      {
        availableBalance: 2000.0,
        balance: 2000.0,
        guid: 'ACT-06sdfsdf44b-caae-0f6e-1383-01fsdfdcb1',
        member_guid: mxMemberGuid,
        name: 'Test Checking Account 2',
        type: 'CHECKING',
        user_guid: user.mxUserId,
      },
      {
        availableBalance: 3000.0,
        balance: 3000.0,
        guid: 'ACT-06sdff44db-caae-0f6e-1383-0sdfddscb1',
        member_guid: mxMemberGuid,
        name: 'Test Saving Account 1',
        type: 'SAVINGS',
        user_guid: user.mxUserId,
      },
    ];

    sandbox
      .stub(utils, 'downloadImageAndBase64Encode')
      .withArgs(mxInstitution.mediumLogoUrl)
      .returns('fake-base-64-encoded');
    sandbox
      .stub(mxClient.members, 'readMember')
      .withArgs(mxMemberGuid, user.mxUserId)
      .returns({ body: { member: mxMember } });
    sandbox
      .stub(mxClient.institutions, 'readInstitution')
      .withArgs(mxInstitution.code)
      .returns({ body: { institution: mxInstitution } });
    sandbox
      .stub(mxClient.members, 'listMemberAccounts')
      .withArgs(mxMemberGuid, user.mxUserId)
      .returns({ body: { accounts: mxMemberAccounts } });
    sandbox
      .stub(mxClient.members, 'readMemberStatus')
      .withArgs(mxMemberGuid, user.mxUserId)
      .returns({
        body: {
          member: {
            connectionStatus: MxConnectionStatus.Connected,
            isBeingAggregated: false,
            hasProcessedAccounts: true,
          },
        },
      });
    sandbox
      .stub(mxClient.verification, 'verifyMember')
      .withArgs(mxMemberGuid, user.mxUserId)
      .throws({
        response: {
          body: {
            error: {
              message: "Member's institution does not support instant account verification.",
            },
          },
          statusCode: 400,
        },
      });

    await request(app)
      .post('/v2/bank_connection')
      .send({ mxMemberGuid, source: BankingDataSource.Mx })
      .set('Authorization', userSession.token)
      .set('X-Device-Id', userSession.deviceId)
      .expect(200);

    const bankConnections = await BankConnection.findAll({ where: { userId: user.id } });

    expect(bankConnections).to.have.length(1);

    const bankConnection = bankConnections[0];
    const bankAccounts = await bankConnection.getBankAccounts();

    expect(bankConnection).to.include({
      bankingDataSource: BankingDataSource.Mx,
      hasValidCredentials: true,
      externalId: mxMemberGuid,
      authToken: mxMemberGuid,
    });
    expect(bankAccounts).to.have.length(2);
    expect(bankAccounts[0]).to.include({
      bankConnectionId: bankConnection.id,
      userId: user.id,
      available: 1000,
      current: 1000,
      externalId: 'ACT-06d7f44b-caae-0f6e-1383-01f52e75dcb1',
      displayName: 'Test Checking Account 1',
      type: 'DEPOSITORY',
      subtype: 'CHECKING',
      accountNumber: null,
      accountNumberAes256: null,
      microDeposit: null,
    });
    expect(bankAccounts[0].accountNumber).to.not.exist;
    expect(bankAccounts[1]).to.include({
      bankConnectionId: bankConnection.id,
      userId: user.id,
      available: 2000,
      current: 2000,
      externalId: 'ACT-06sdfsdf44b-caae-0f6e-1383-01fsdfdcb1',
      displayName: 'Test Checking Account 2',
      type: 'DEPOSITORY',
      subtype: 'CHECKING',
      accountNumber: null,
      accountNumberAes256: null,
      microDeposit: null,
    });

    const auditLogs = await AuditLog.findAll({
      where: { userId: user.id, type: 'NO_AUTH_ACCOUNT' },
    });

    expect(auditLogs).to.have.lengthOf(1);
    expect(auditLogs[0].eventUuid).to.eq(bankConnection.id.toString());
    expect(auditLogs[0].extra).to.include({
      source: bankConnection.bankingDataSource,
      errorCode: '400',
      externalId: bankConnection.externalId,
      errorMessage: "Member's institution does not support instant account verification.",
      institutionName: mxInstitution.name,
      mxInstitutionCode: mxInstitution.code,
    });
  });
});
