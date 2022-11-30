import { expect } from 'chai';
import factory from '../../factories';
import { clean } from '../../test-helpers';

import * as sinon from 'sinon';
import plaidClient from '../../../src/lib/plaid';
import redisClient from '../../../src/lib/redis';
import getPlaidInstitutionSubsystemStatus from '../../../src/helper/institution-status/get-plaid-institution-subsystem-status';

describe('InstitutionStatusHelper get', () => {
  const sandbox = sinon.createSandbox();

  before(() => clean());

  afterEach(() => clean(sandbox));

  it('should return an plaid subsystem status without hitting the cache', async () => {
    const plaidResponse = await factory.build(
      'plaid_status_response_unhealthy_login_and_transaction',
    );
    const plaidStub = sandbox.stub(plaidClient, 'getInstitutionById').resolves(plaidResponse);
    const redisSpy = sandbox.spy(redisClient, 'setAsync' as any);

    const plaidInstitutionSubsystemStatus = await getPlaidInstitutionSubsystemStatus('1');

    expect(plaidInstitutionSubsystemStatus).to.be.deep.eq(plaidResponse.institution.status);
    sinon.assert.calledOnce(redisSpy);
    sinon.assert.calledOnce(plaidStub);
  });

  it('should return null and log error if plaid client errors out', async () => {
    sandbox
      .stub(plaidClient, 'getInstitutionById')
      .throws(new Error('Throws acid into the system'));
    const plaidInstitutionSubsystemStatus = await getPlaidInstitutionSubsystemStatus('1');
    expect(plaidInstitutionSubsystemStatus).to.be.null;
  });

  it('should retrieve plaid subsystem status from cache on the second call', async () => {
    const plaidResponse = await factory.build(
      'plaid_status_response_unhealthy_login_and_transaction',
    );
    const plaidStub = sandbox.stub(plaidClient, 'getInstitutionById').resolves(plaidResponse);
    const setAsyncSpy = sandbox.spy(redisClient, 'setAsync' as any);
    const getAsyncSpy = sandbox.spy(redisClient, 'getAsync' as any);

    const plaidInstitutionSubsystemStatus1 = await getPlaidInstitutionSubsystemStatus('1');
    expect(plaidInstitutionSubsystemStatus1).to.be.deep.eq(plaidResponse.institution.status);

    const plaidInstitutionSubsystemStatus2 = await getPlaidInstitutionSubsystemStatus('1');
    expect(plaidInstitutionSubsystemStatus2).to.be.deep.eq(plaidResponse.institution.status);

    sinon.assert.calledOnce(plaidStub);
    sinon.assert.calledOnce(setAsyncSpy);
    sinon.assert.calledTwice(getAsyncSpy);
  });
});
