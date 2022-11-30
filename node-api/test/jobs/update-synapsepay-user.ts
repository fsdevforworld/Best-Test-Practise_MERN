import { expect, use } from 'chai';
import * as sinon from 'sinon';
import chaiAsPromised from 'chai-as-promised';
import factory from '../factories';
import { updateSynapsePayUser } from '../../src/jobs/handlers/update-synapsepay-user';
import * as SynapsePay from '../../src/domain/synapsepay';
import { SynapsePayUserUpdateFields } from 'synapsepay';
import { moment } from '@dave-inc/time-lib';
import { clean } from '../test-helpers';

describe('Job: update-synapsepay-user', () => {
  const sandbox = sinon.createSandbox();

  let upsertSynapsePayUserStub: sinon.SinonStub;
  const ip = '66.66.66.666';

  beforeEach(() => {
    upsertSynapsePayUserStub = sandbox.stub(SynapsePay, 'upsertSynapsePayUser');
  });

  afterEach(() => clean(sandbox));

  it('should call upsertSynapsePayUser with phone number update', async () => {
    const user = await factory.create('user');

    await updateSynapsePayUser({ userId: user.id, options: { ip } });

    const [[userParam, ipParam, fieldParam]] = upsertSynapsePayUserStub.args;
    expect(userParam.synapsepayId).to.equal(user.synapsepayId);
    expect(ipParam).to.equal(ip);
    expect(fieldParam).to.be.undefined;
  });

  it('should call upsertSynapsePayUser with address update', async () => {
    const user = await factory.create('user');
    const fields: SynapsePayUserUpdateFields = {
      addressLine1: '1 MARKET ST',
      addressLine2: undefined,
      birthdate: undefined,
      city: 'SAN FRANCISCO',
      state: 'CA',
      zipCode: '94105',
      countryCode: 'US',
      firstName: undefined,
      lastName: undefined,
    };
    await updateSynapsePayUser({ userId: user.id, options: { ip, fields } });

    const [[userParam, ipParam, fieldParam]] = upsertSynapsePayUserStub.args;
    expect(userParam.synapsepayId).to.equal(user.synapsepayId);
    expect(ipParam).to.equal(ip);
    expect(fieldParam).to.equal(fields);
  });

  it('should call upsertSynapsePayUser with email update', async () => {
    const user = await factory.create('user');
    const fields: SynapsePayUserUpdateFields = { email: 'myNewEmail@gmail.com' };

    await updateSynapsePayUser({ userId: user.id, options: { fields } });

    const [[userParam, ipParam, fieldParam]] = upsertSynapsePayUserStub.args;
    expect(userParam.synapsepayId).to.equal(user.synapsepayId);
    expect(ipParam).to.be.undefined;
    expect(fieldParam).to.equal(fields);
  });

  it('should call upsertSynapsePayUser with name update', async () => {
    const user = await factory.create('user');
    const fields: SynapsePayUserUpdateFields = {
      firstName: 'Michelle',
      lastName: 'Kwan',
      birthdate: undefined,
      addressLine1: undefined,
      addressLine2: undefined,
      city: undefined,
      state: undefined,
      zipCode: undefined,
      countryCode: undefined,
    };

    await updateSynapsePayUser({ userId: user.id, options: { fields } });

    const [[userParam, ipParam, fieldParam]] = upsertSynapsePayUserStub.args;
    expect(userParam.synapsepayId).to.equal(user.synapsepayId);
    expect(ipParam).to.be.undefined;
    expect(fieldParam).to.equal(fields);
  });

  it('should call upsertSynapsePayUser with birthdate update', async () => {
    const user = await factory.create('user');
    const fields: SynapsePayUserUpdateFields = {
      birthdate: '1959-12-31',
      firstName: undefined,
      lastName: undefined,
      addressLine1: undefined,
      addressLine2: undefined,
      city: undefined,
      state: undefined,
      zipCode: undefined,
      countryCode: undefined,
    };

    await updateSynapsePayUser({ userId: user.id, options: { fields } });

    const [[userParam, ipParam, fieldParam]] = upsertSynapsePayUserStub.args;
    expect(userParam.synapsepayId).to.equal(user.synapsepayId);
    expect(ipParam).to.be.undefined;
    expect(fieldParam).to.equal(fields);
  });

  it('should not call upserSynapsePayUser if update fields are passed in as undefined', async () => {
    const user = await factory.create('user');
    const fields: SynapsePayUserUpdateFields = {
      firstName: undefined,
      lastName: undefined,
      birthdate: undefined,
      addressLine1: undefined,
      addressLine2: undefined,
      city: undefined,
      state: undefined,
      zipCode: undefined,
      countryCode: undefined,
    };
    await updateSynapsePayUser({ userId: user.id, options: { fields } });
    expect(upsertSynapsePayUserStub.called).to.be.false;
  });

  it('should not call upsertSynapsePayUser when user does not have a Synapsepay id', async () => {
    use(() => chaiAsPromised);
    const user = await factory.create('user', { synapsepayId: null });
    await expect(updateSynapsePayUser({ userId: user.id })).not.to.be.rejected;
    expect(upsertSynapsePayUserStub.called).to.be.false;
  });

  it('should not call upsertSynapsePayUser when user is deleted', async () => {
    use(() => chaiAsPromised);
    const user = await factory.create('user', {
      deleted: moment(),
    });

    await expect(updateSynapsePayUser({ userId: user.id })).not.to.be.rejected;

    expect(upsertSynapsePayUserStub.called).to.be.false;
  });
});
