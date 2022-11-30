import { expect } from 'chai';
import * as request from 'supertest';
import * as sinon from 'sinon';
import { AuditLog, BankAccount, User } from '../../../../../src/models';
import app from '../../../../../src/services/internal-dashboard-api';
import factory from '../../../../factories';
import { clean, withInternalUser } from '../../../../test-helpers';

describe('PUT /dashboard/user/:userId', () => {
  const sandbox = sinon.createSandbox();

  before(() => clean(sandbox));

  let auditLogStub: sinon.SinonStub;

  beforeEach(() => {
    auditLogStub = sandbox.stub(AuditLog, 'create');
  });

  afterEach(() => clean(sandbox));

  it('updates allowDuplicateCard', async () => {
    const userInfo = {
      firstName: 'John',
      lastName: 'Smith',
      phoneNumber: '+12223334444',
      birthdate: '1989-12-25',
      addressLine1: '456 Main St',
      addressLine2: 'Unit 5',
      city: 'Katy',
      state: 'TX',
      zipCode: '77494',
      allowDuplicateCard: false,
      overrideSixtyDayDelete: false,
    };

    const user = await factory.create('user', userInfo);

    const req = request(app)
      .put(`/dashboard/user/${user.id}`)
      .send({ allowDuplicateCard: true })
      .expect(200);

    await withInternalUser(req);

    await user.reload();

    expect(user.allowDuplicateCard).to.equal(true);

    sinon.assert.calledWithExactly(auditLogStub, {
      userId: user.id,
      type: AuditLog.TYPES.USER_PROFILE_UPDATE,
      successful: true,
      extra: {
        adminId: sinon.match.number,
        requestPayload: { allowDuplicateCard: true },
        modifications: {
          allowDuplicateCard: {
            previousValue: userInfo.allowDuplicateCard,
            currentValue: true,
          },
        },
      },
    });
  });

  it('should return the updated user roles when user roles are changed', async () => {
    const user = await factory.create('user');
    const newData = {
      roles: ['tester'],
    };

    const req = request(app)
      .put(`/dashboard/user/${user.id}`)
      .send(newData)
      .expect(200);

    const res = await withInternalUser(req);

    expect(res.body.roles[0].name).to.equal('tester');
  });

  it('allows the default bank account to be updated', async () => {
    const user = await factory.create<User>('user', { defaultBankAccountId: null });
    const bankAccount = await factory.create<BankAccount>('bank-account', { userId: user.id });

    const res = await withInternalUser(
      request(app)
        .put(`/dashboard/user/${user.id}`)
        .send({ defaultBankAccountId: bankAccount.id })
        .expect(200),
    );

    expect(res.body.defaultBankAccountId).to.equal(bankAccount.id);

    const [bankConnection] = await Promise.all([bankAccount.getBankConnection(), user.reload()]);

    expect(user.defaultBankAccountId).to.equal(bankAccount.id);
    expect(bankConnection.primaryBankAccountId).to.equal(bankAccount.id);
  });
});
