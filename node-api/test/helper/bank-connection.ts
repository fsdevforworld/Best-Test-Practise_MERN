import * as sinon from 'sinon';
import { BankConnection, User } from '../../src/models';
import BankConnectionHelper from '../../src/helper/bank-connection';
import mxClient from '../../src/lib/mx';
import factory from '../factories';
import { clean } from '../test-helpers';
import { expect } from 'chai';
import { moment } from '@dave-inc/time-lib';
import { MxConnectionStatus } from '../../src/typings';
import * as plaid from 'plaid';

describe('BankConnection', () => {
  const sandbox = sinon.createSandbox();

  before(() => clean());

  const plaidAccounts = [
    {
      account_id: '1',
      mask: '1111',
      name: 'Plaid Account 1',
      balances: {
        current: 100,
        available: 200,
      },
      type: 'depository',
      subtype: 'checking',
    },
    {
      account_id: '2',
      mask: '1112',
      name: 'Plaid Account 2',
      balances: {
        current: 300,
        available: 400,
      },
      type: 'depository',
      subtype: 'checking',
    },
  ];

  beforeEach(() => {
    sandbox.stub(plaid.Client.prototype, 'getAccounts').resolves({ accounts: plaidAccounts });
  });

  afterEach(() => clean(sandbox));

  describe('generateMxConnectionUrl', () => {
    it('should create mx user and generate connection widget url along with members', async () => {
      const timeNow = moment().toString();
      const mxMemberGuid = 'MBR-jeff-id';
      const mxBankName = 'Wells Fargo';
      const user = await factory.create<User>('user');
      await factory.create('bank-connection', {
        externalId: mxMemberGuid,
      });

      const fakeMxUser = { guid: 'USR-fake-mx-user-guid' };
      const fakeMxUserConnectWidgetUrl = 'fake-mx-user-connect-widget-url';

      const mxCreateUserStub = sandbox
        .stub(mxClient.users, 'createUser')
        .resolves({ body: { user: fakeMxUser } });
      const mxGetMemberListStub = sandbox.stub(mxClient.members, 'listMembers').resolves({
        body: {
          members: [
            {
              aggregatedAt: timeNow,
              guid: mxMemberGuid,
              name: mxBankName,
            },
          ],
        },
      });
      const mxGetConnectWidgetStub = sandbox
        .stub(mxClient.connectWidget, 'getConnectWidget')
        .resolves({ body: { user: { connectWidgetUrl: fakeMxUserConnectWidgetUrl } } });

      const url = await BankConnectionHelper.generateMxConnectionUrl(user);

      await user.reload();

      expect(url).to.eq(fakeMxUserConnectWidgetUrl);
      expect(user.mxUserId).to.eq(fakeMxUser.guid);

      sinon.assert.calledWith(mxCreateUserStub, {
        user: { metadata: JSON.stringify({ user_id: user.id }), identifier: null },
      });
      sinon.assert.calledWith(mxGetMemberListStub, user.mxUserId);
      sinon.assert.calledWith(mxGetConnectWidgetStub, fakeMxUser.guid, {
        currentInstitutionCode: undefined,
        isMobileWebview: false,
        uiMessageVersion: 4,
      });
    });

    it('should generate connection widget url given institutionCode', async () => {
      const user = await factory.create<User>('user', { mxUserId: 'USR-fake-mx-user-guid' });
      const currentInstitutionCode = 'wells-fargo';
      const fakeMxUserConnectWidgetUrl = 'fake-mx-user-connect-widget-url';

      const mxGetMemberListStub = sandbox.stub(mxClient.members, 'listMembers').resolves({
        body: {
          members: [],
        },
      });
      const mxGetConnectWidgetStub = sandbox
        .stub(mxClient.connectWidget, 'getConnectWidget')
        .resolves({ body: { user: { connectWidgetUrl: fakeMxUserConnectWidgetUrl } } });

      const url = await BankConnectionHelper.generateMxConnectionUrl(user, {
        mxInstitutionCode: currentInstitutionCode,
      });

      expect(url).to.eq(fakeMxUserConnectWidgetUrl);

      sinon.assert.calledWith(mxGetMemberListStub, user.mxUserId);
      sinon.assert.calledWith(mxGetConnectWidgetStub, user.mxUserId, {
        currentInstitutionCode,
        isMobileWebview: false,
        uiMessageVersion: 4,
      });
    });

    it('should generate connection widget url given bankConnectionId', async () => {
      const user = await factory.create<User>('user', { mxUserId: 'USR-fake-mx-user-guid' });
      const connection = await factory.create<BankConnection>('bank-connection');
      const fakeMxUserConnectWidgetUrl = 'fake-mx-user-connect-widget-url';

      const mxGetMemberListStub = sandbox.spy(mxClient.members, 'listMembers');
      sandbox.stub(mxClient.members, 'readMemberStatus').resolves({
        body: {
          member: { connectionStatus: MxConnectionStatus.Connected },
        },
      });
      const mxGetConnectWidgetStub = sandbox
        .stub(mxClient.connectWidget, 'getConnectWidget')
        .resolves({ body: { user: { connectWidgetUrl: fakeMxUserConnectWidgetUrl } } });

      const url = await BankConnectionHelper.generateMxConnectionUrl(user, {
        bankConnectionId: connection.id,
      });

      expect(url).to.eq(fakeMxUserConnectWidgetUrl);

      sinon.assert.notCalled(mxGetMemberListStub);
      sinon.assert.calledWith(mxGetConnectWidgetStub, user.mxUserId, {
        currentInstitutionCode: undefined,
        currentMemberGuid: connection.externalId,
        disableInstitutionSearch: true,
        isMobileWebview: false,
        uiMessageVersion: 4,
        updateCredentials: true,
      });
    });

    it('should generate connection widget url given bankConnectionId with updateCredentials false if latest member has CHALLENGED status', async () => {
      const user = await factory.create<User>('user', { mxUserId: 'USR-fake-mx-user-guid' });
      const connection = await factory.create<BankConnection>('bank-connection');
      const fakeMxUserConnectWidgetUrl = 'fake-mx-user-connect-widget-url';

      const mxGetMemberListStub = sandbox.spy(mxClient.members, 'listMembers');
      sandbox.stub(mxClient.members, 'readMemberStatus').resolves({
        body: {
          member: { connectionStatus: MxConnectionStatus.Challenged },
        },
      });
      const mxGetConnectWidgetStub = sandbox
        .stub(mxClient.connectWidget, 'getConnectWidget')
        .resolves({ body: { user: { connectWidgetUrl: fakeMxUserConnectWidgetUrl } } });

      const url = await BankConnectionHelper.generateMxConnectionUrl(user, {
        bankConnectionId: connection.id,
      });

      expect(url).to.eq(fakeMxUserConnectWidgetUrl);

      sinon.assert.notCalled(mxGetMemberListStub);
      sinon.assert.calledWith(mxGetConnectWidgetStub, user.mxUserId, {
        currentInstitutionCode: undefined,
        currentMemberGuid: connection.externalId,
        disableInstitutionSearch: true,
        isMobileWebview: false,
        uiMessageVersion: 4,
        updateCredentials: false,
      });
    });

    it('should generate connection widget url with the latest aggregated member if there are other mx members', async () => {
      const user = await factory.create<User>('user', { mxUserId: 'USR-fake-mx-user-guid' });
      const currentMemberGuid = 'MBR-12345';
      await factory.create('bank-connection', { externalId: 'MBR-1234' });
      const fakeMxUserConnectWidgetUrl = 'fake-mx-user-connect-widget-url';

      const mxGetMemberListStub = sandbox.stub(mxClient.members, 'listMembers').resolves({
        body: {
          members: [
            {
              aggregatedAt: '11-16-17',
              guid: 'MBR-123',
              name: 'member1',
            },
            {
              aggregatedAt: '11-16-18',
              guid: 'MBR-1234',
              name: 'member2',
            },
            {
              aggregatedAt: '11-16-19 01:00:01',
              guid: currentMemberGuid,
              name: 'member3',
            },
            {
              aggregatedAt: '11-16-19 01:00:00',
              guid: 'MBR-222',
              name: 'member4',
            },
          ],
        },
      });
      const mxGetConnectWidgetStub = sandbox
        .stub(mxClient.connectWidget, 'getConnectWidget')
        .resolves({ body: { user: { connectWidgetUrl: fakeMxUserConnectWidgetUrl } } });

      const url = await BankConnectionHelper.generateMxConnectionUrl(user);

      expect(url).to.eq(fakeMxUserConnectWidgetUrl);

      sinon.assert.calledWith(mxGetMemberListStub, user.mxUserId);
      sinon.assert.calledWith(mxGetConnectWidgetStub, user.mxUserId, {
        currentInstitutionCode: undefined,
        currentMemberGuid,
        isMobileWebview: false,
        uiMessageVersion: 4,
        updateCredentials: true,
      });
    });

    it('should generate connection widget url with updateCredentials false if latest member has CHALLENGED status', async () => {
      const user = await factory.create<User>('user', { mxUserId: 'USR-fake-mx-user-guid' });
      const currentMemberGuid = 'MBR-12345';
      await factory.create('bank-connection', { externalId: 'MBR-1234' });
      const fakeMxUserConnectWidgetUrl = 'fake-mx-user-connect-widget-url';

      const mxGetMemberListStub = sandbox.stub(mxClient.members, 'listMembers').resolves({
        body: {
          members: [
            {
              aggregatedAt: '11-16-17',
              guid: 'MBR-123',
              name: 'member1',
            },
            {
              aggregatedAt: '11-16-18',
              guid: 'MBR-1234',
              name: 'member2',
            },
            {
              aggregatedAt: '11-16-19 01:00:01',
              guid: currentMemberGuid,
              name: 'member3',
              connectionStatus: MxConnectionStatus.Challenged,
            },
            {
              aggregatedAt: '11-16-19 01:00:00',
              guid: 'MBR-222',
              name: 'member4',
            },
          ],
        },
      });
      const mxGetConnectWidgetStub = sandbox
        .stub(mxClient.connectWidget, 'getConnectWidget')
        .resolves({ body: { user: { connectWidgetUrl: fakeMxUserConnectWidgetUrl } } });

      const url = await BankConnectionHelper.generateMxConnectionUrl(user);

      expect(url).to.eq(fakeMxUserConnectWidgetUrl);

      sinon.assert.calledWith(mxGetMemberListStub, user.mxUserId);
      sinon.assert.calledWith(mxGetConnectWidgetStub, user.mxUserId, {
        currentInstitutionCode: undefined,
        currentMemberGuid,
        isMobileWebview: false,
        uiMessageVersion: 4,
        updateCredentials: false,
      });
    });

    it('should use existing mx user id and generate connection widget url', async () => {
      const user = await factory.create<User>('user', {
        mxUserId: 'USR-fake-mx-user-guid',
      });

      const fakeMxUserConnectWidgetUrl = 'fake-mx-user-connect-widget-url';

      const mxCreateUserStub = sandbox.stub(mxClient.users, 'createUser');
      const mxGetMemberListStub = sandbox
        .stub(mxClient.members, 'listMembers')
        .resolves({ body: { members: [] } });
      const mxGetConnectWidgetStub = sandbox
        .stub(mxClient.connectWidget, 'getConnectWidget')
        .resolves({ body: { user: { connectWidgetUrl: fakeMxUserConnectWidgetUrl } } });

      const url = await BankConnectionHelper.generateMxConnectionUrl(user);

      await user.reload();

      expect(url).to.eq(fakeMxUserConnectWidgetUrl);

      sinon.assert.notCalled(mxCreateUserStub);
      sinon.assert.calledWith(mxGetMemberListStub, user.mxUserId);
      sinon.assert.calledWith(mxGetConnectWidgetStub, user.mxUserId, {
        currentInstitutionCode: undefined,
        isMobileWebview: false,
        uiMessageVersion: 4,
      });
    });

    it('should bubble up any mx API errors', async () => {
      const user = await factory.create<User>('user');

      sandbox.stub(mxClient.users, 'createUser').throws(new Error('API Error'));

      let errorThrown: Error;

      try {
        await BankConnectionHelper.generateMxConnectionUrl(user);
      } catch (err) {
        errorThrown = err;
      }

      expect(errorThrown).to.exist;
      expect(errorThrown.message).eq('API Error');
    });
  });
});
