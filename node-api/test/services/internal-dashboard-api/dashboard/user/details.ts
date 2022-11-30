import { expect } from 'chai';
import * as request from 'supertest';
import factory from '../../../../factories';
import {
  BankConnection,
  MembershipPause,
  PhoneNumberChangeRequest,
  SupportUserView,
  SynapsepayDocument,
  User,
} from '../../../../../src/models';
import { moment, MOMENT_FORMATS } from '@dave-inc/time-lib';
import app from '../../../../../src/services/internal-dashboard-api';
import {
  clean,
  stubBankTransactionClient,
  up,
  isDateTime,
  withInternalUser,
  createInternalUser,
  stubLoomisClient,
} from '../../../../test-helpers';
import * as sinon from 'sinon';
import { SettingId } from '../../../../../src/typings';
import { DonationOrganizationCode, ExternalTransactionProcessor } from '@dave-inc/wire-typings';

describe('GET /dashboard/user/details/:userId', () => {
  const sandbox = sinon.createSandbox();

  before(() => clean());

  beforeEach(async () => {
    stubLoomisClient(sandbox);
  });

  afterEach(() => clean(sandbox));

  it('creates a new row in support_user_views', async () => {
    const [user, agent] = await Promise.all([factory.create('user'), createInternalUser()]);

    await withInternalUser(request(app).get(`/dashboard/user/details/${user.id}`), agent);

    const views = await SupportUserView.findAll({ where: { userId: user.id } });
    expect(views[0].viewerId).to.equal(agent.id);
  });

  it('returns membership pause details', async () => {
    const membershipPause = await factory.create<MembershipPause>('membership-pause');
    await factory.create<MembershipPause>('membership-pause', {
      userId: membershipPause.userId,
      unpausedAt: moment('2019-12-05'),
    });

    const req = request(app).get(`/dashboard/user/details/${membershipPause.userId}`);
    const res = await withInternalUser(req);

    expect(res.status).to.equal(200);
    expect(res.body.membershipPause.id).to.equal(membershipPause.id);
    expect(res.body.membershipPause.isActive).to.equal(membershipPause.isActive());
    expect(res.body.membershipPauses.length).to.eq(2);
    expect(res.body.membershipPauses[1].id).to.equal(membershipPause.id);
  });

  it('should include non-deleted and soft-deleted bank connections', async () => {
    const user = await factory.create('user');

    const activeBankConnection = await factory.create('bank-connection', { userId: user.id });
    const inactiveBankConnection = await factory.create('bank-connection', {
      userId: user.id,
      deleted: moment(),
    });

    const req = request(app).get(`/dashboard/user/details/${user.id}`);
    const res = await withInternalUser(req);

    expect(res.status).to.equal(200);
    expect(res.body.bankConnections.length).to.equal(2);
    expect(res.body.bankConnections.map((conn: BankConnection) => conn.id)).to.include.members(
      [activeBankConnection.id, inactiveBankConnection.id],
      'Does not include both active and inactive connections',
    );
  });

  it('should return user details with unpaused membership info', async () => {
    const userNeedingPause = await factory.create('user');
    const membershipPause = await factory.create<MembershipPause>('unpaused-membership-pause', {
      userId: userNeedingPause.id,
    });

    const req = request(app).get(`/dashboard/user/details/${membershipPause.userId}`);
    const res = await withInternalUser(req);

    expect(res.status).to.equal(200);

    const resMembershipPause = res.body.membershipPauses[0];
    expect(resMembershipPause.id).to.equal(membershipPause.id);
    expect(resMembershipPause.userId).to.equal(userNeedingPause.id);
  });

  it('should return a synapsepay_document', async () => {
    const synapsepayId = '5a7e272b77c19b-test';
    const user = await factory.create('user', {
      defaultBankAccountId: null,
      synapsepayId,
    });
    const userId = user.id;
    const synapsepayDocument = await factory.create('synapsepay-document', {
      userId,
      synapsepayUserId: synapsepayId,
    });

    const req = request(app).get(`/dashboard/user/details/${user.id}`);
    const res = await withInternalUser(req);

    expect(res.status).to.equal(200);

    const returnedPermission = res.body.synapsepayDocument.permission;
    expect(synapsepayDocument.permission).to.be.equal(returnedPermission);
  });

  it('returns all synapsepay documents associated with the user', async () => {
    const user = await factory.create<User>('user', { synapsepayId: 'primary-doc' });

    await Promise.all([
      factory.create<SynapsepayDocument>('synapsepay-document', {
        userId: user.id,
        synapsepayUserId: 'primary-doc',
      }),
      factory.create<SynapsepayDocument>('synapsepay-document', {
        userId: user.id,
        synapsepayUserId: 'secondary-doc',
      }),
      factory
        .create<SynapsepayDocument>('synapsepay-document', {
          userId: user.id,
          synapsepayUserId: 'deleted-doc',
        })
        .then(doc => doc.destroy()),
    ]);

    const req = request(app).get(`/dashboard/user/details/${user.id}`);
    const res = await withInternalUser(req);
    const { synapsepayDocuments } = res.body;

    expect(synapsepayDocuments.length).to.equal(3);

    synapsepayDocuments.forEach((doc: SynapsepayDocument) =>
      expect(['primary-doc', 'secondary-doc', 'deleted-doc']).to.include(doc.synapsepayUserId),
    );
  });

  it('should return payment methods with decrypted BIN values', async () => {
    const user = await factory.create('user', {
      defaultBankAccountId: null,
      synapsepayId: null,
    });

    const bankConnection = await factory.create('bank-connection', { userId: user.id });
    const bankAccount = await factory.create('bank-account', {
      bankConnectionId: bankConnection.id,
      userId: user.id,
    });

    await factory.create('payment-method', {
      userId: user.id,
      bankAccountId: bankAccount.id,
      availability: 'immediate',
      mask: '1111',
      displayName: 'Chase Debit: 1111',
      expiration: '2020-01-01',
      scheme: 'visa',
      bin: '123456',
    });

    const req = request(app).get(`/dashboard/user/details/${user.id}`);
    const res = await withInternalUser(req);

    expect(res.body.connections[0].accounts[0].methods).to.be.not.be.empty;
    expect(res.body.connections[0].accounts[0].methods[0].bin).to.equal('123456');
  });

  it('returns any transaction settlements related to the advance', async () => {
    const advance = await factory.create('advance');
    await Promise.all([
      factory.create('advance-tip', { advanceId: advance.id }),
      factory.create('transaction-settlement', { sourceId: advance.id }),
    ]);

    const userId = advance.userId;
    const req = request(app).get(`/dashboard/user/details/${userId}`);
    const res = await withInternalUser(req);

    const settlements = res.body.advances[0].transactionSettlements;
    expect(settlements.length).to.eq(1);
    expect(settlements[0].sourceId).to.eq(advance.id);
  });

  it('returns a deleted advance', async () => {
    const advance = await factory.create('advance');
    await factory.create('advance-tip', { advanceId: advance.id });
    const userId = advance.userId;
    const defaultedDbDate = '9999-12-31T23:59:59.000Z';
    await advance.destroy();

    const req = request(app).get(`/dashboard/user/details/${userId}`);
    const res = await withInternalUser(req);

    const deletedAdvance = res.body.advances[0];
    expect(deletedAdvance.deleted).to.not.equal(defaultedDbDate); // if they equal, then advance is not in a deleted state
  });

  it('includes unsuccessful phone number change request', async () => {
    const phoneNumber = '+19004777777';
    const newUser = await factory.create('user', {
      phoneNumber,
    });
    const phoneNumberChangeRequest = await factory.create<PhoneNumberChangeRequest>(
      'phone-number-change-request',
      {
        userId: newUser.id,
      },
    );

    const req = request(app).get(`/dashboard/user/details/${newUser.id}`);
    const res = await withInternalUser(req);
    const { phoneNumberChangeRequests, user } = res.body;

    expect(user.phoneNumber).to.equal(phoneNumber);
    expect(phoneNumberChangeRequests.length).to.equal(1);
    expect(phoneNumberChangeRequests[0].id).to.equal(phoneNumberChangeRequest.id);
    expect(phoneNumberChangeRequests[0].verified).to.be.null;
  });

  it('includes successful phone number change request', async () => {
    const now = moment();
    const currentUserPhoneNumber = '+19004555555';
    const newUserPhoneNumber = '+19004666666';
    let newUser = await factory.create('user', {
      phoneNumber: currentUserPhoneNumber,
    });
    const phoneNumberChangeRequest = await factory.create<PhoneNumberChangeRequest>(
      'phone-number-change-request',
      {
        userId: newUser.id,
        oldPhoneNumber: currentUserPhoneNumber,
        newPhoneNumber: newUserPhoneNumber,
        verified: now,
      },
    );
    newUser = await newUser.update({
      phoneNumber: newUserPhoneNumber,
    });

    const req = request(app).get(`/dashboard/user/details/${newUser.id}`);
    const res = await withInternalUser(req);

    const { phoneNumberChangeRequests, user } = res.body;
    const verifiedDate = moment(phoneNumberChangeRequests[0].verified).format(
      MOMENT_FORMATS.DATETIME,
    );

    expect(verifiedDate).to.equal(now.format(MOMENT_FORMATS.DATETIME));
    expect(user.phoneNumber).to.equal(newUserPhoneNumber);
    expect(phoneNumberChangeRequests[0].newPhoneNumber).to.equal(newUserPhoneNumber);
    expect(phoneNumberChangeRequests.length).to.equal(1);
    expect(phoneNumberChangeRequests[0].id).to.equal(phoneNumberChangeRequest.id);
    expect(phoneNumberChangeRequests[0].oldPhoneNumber).to.equal(currentUserPhoneNumber);
  });

  it('returns user details for deleted users', async () => {
    stubBankTransactionClient(sandbox);
    await up();

    const req = request(app).get(`/dashboard/user/details/${1500}`);
    const res = await withInternalUser(req);

    expect(res.body.user.firstName).to.be.equal('DeletedDave');
    expect(res.body.user.lastName).to.be.equal('1500');
    expect(res.body.user.deleted).to.not.equal('9999-12-31 23:59:59');
  });

  it('includes all bank accounts for the user', async () => {
    const user = await factory.create<User>('user');
    const [active, deleted] = await Promise.all([
      factory.create('bank-account', { userId: user.id }),
      factory.create('bank-account', { userId: user.id }).then(a => a.destroy()),
    ]);

    const req = request(app).get(`/dashboard/user/details/${user.id}`);
    const {
      body: { bankAccounts },
    } = await withInternalUser(req);

    expect(bankAccounts.length).to.equal(2);

    const bankAccountIds = bankAccounts.map((b: { id: number }) => b.id);
    expect(bankAccountIds).to.include(active.id, 'active not included');
    expect(bankAccountIds).to.include(deleted.id, 'deleted not included');
  });

  it('includes all cards for the user', async () => {
    const user = await factory.create<User>('user');
    const [active, deleted] = await Promise.all([
      factory.create('payment-method', { userId: user.id }),
      factory.create('payment-method', { userId: user.id }).then(a => a.destroy()),
    ]);

    const req = request(app).get(`/dashboard/user/details/${user.id}`);
    const {
      body: { cards },
    } = await withInternalUser(req);

    expect(cards.length).to.equal(2);

    const cardIds = cards.map((c: { id: number }) => c.id);
    expect(cardIds).to.include(active.id, 'active not included');
    expect(cardIds).to.include(deleted.id, 'deleted not included');
  });

  it('includes all devices with time first seen', async () => {
    const user = await factory.create('user');

    const earlyTime = moment().subtract('2', 'day');
    const recentTime = moment().subtract('1', 'day');
    factory.create('user-session', {
      userId: user.id,
      deviceId: 'test_device',
      deviceType: 'ios',
      created: earlyTime,
    });
    factory.create('user-session', {
      userId: user.id,
      deviceId: 'test_device',
      deviceType: 'ios',
      created: recentTime,
    });

    const req = request(app).get(`/dashboard/user/details/${user.id}`);
    const {
      body: { devices },
    } = await withInternalUser(req);

    const createdDevice = devices.filter((device: any) => device.id === 'test_device');

    expect(createdDevice.length).to.equal(1);
    expect(createdDevice[0].deviceType).to.equal('ios');
    expect(moment(createdDevice[0].firstSeenAt)).to.be.sameMoment(earlyTime, 'second');
  });

  it('includes devices from revoked sessions', async () => {
    const user = await factory.create('user');

    factory.create('user-session', {
      userId: user.id,
      deviceId: 'test_device',
      revoked: moment(),
    });

    const req = request(app).get(`/dashboard/user/details/${user.id}`);
    const {
      body: { devices },
    } = await withInternalUser(req);

    const createdDevice = devices.filter((device: any) => device.id === 'test_device');

    expect(createdDevice.length).to.equal(1);
  });

  it("includes user's locale setting", async () => {
    const user = await factory.create('user');
    const userSetting = await factory.create('user-setting', {
      userId: user.id,
      userSettingNameId: SettingId.locale,
    });

    const req = request(app).get(`/dashboard/user/details/${user.id}`);
    const {
      body: { locale },
    } = await withInternalUser(req);

    expect(locale).to.equal(userSetting.value);
  });

  it("includes user's locale setting as en/English if one is not set", async () => {
    const user = await factory.create('user');

    const req = request(app).get(`/dashboard/user/details/${user.id}`);
    const {
      body: { locale },
    } = await withInternalUser(req);

    expect(locale).to.equal('en');
  });

  it('includes users cool off status', async () => {
    const user = await factory.create('user');

    const req = request(app).get(`/dashboard/user/details/${user.id}`);
    const res = await withInternalUser(req);

    const { isCoolingOff, coolOffDate } = res.body.coolOffStatus;

    expect(isCoolingOff).to.equal(false);
    expect(coolOffDate).to.be.null;
  });

  it('formats cool off status correctly', async () => {
    const user = await factory.create('user');
    const created = moment().startOf('second');
    const advance = await factory.create('advance', {
      userId: user.id,
      amount: 24.99,
      created: created.clone().subtract(5, 'second'),
    });
    await factory.create('advance-tip', {
      advanceId: advance.id,
      donationOrganization: DonationOrganizationCode.TREES,
    });
    await factory.create('payment', {
      advanceId: advance.id,
      amount: 12,
      created,
      externalProcessor: ExternalTransactionProcessor.Tabapay,
    });

    await advance.reload();

    const req = request(app).get(`/dashboard/user/details/${user.id}`);
    const res = await withInternalUser(req);

    const { isCoolingOff, coolOffDate } = res.body.coolOffStatus;

    expect(isCoolingOff).to.equal(true);
    expect(isDateTime(coolOffDate)).to.be.true;
  });
});
