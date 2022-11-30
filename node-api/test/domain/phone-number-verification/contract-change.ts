import { expect } from 'chai';
import * as sinon from 'sinon';
import factory from '../../factories';
import { clean } from '../../test-helpers';
import phoneNumberVerification from '../../../src/domain/phone-number-verification';
import redis from '../../../src/lib/redis';
import twilio from '../../../src/lib/twilio';
import { User } from '../../../src/models';

describe('checkForContractChange', async () => {
  let user: User;
  let twilioCheckContractStub: sinon.SinonStub;
  const sandbox = sinon.createSandbox();

  before(async () => {
    user = await factory.create<User>('user');
    return clean();
  });

  beforeEach(() => {
    twilioCheckContractStub = sandbox.stub(twilio, 'checkForContractChange').resolves(false);
    sandbox.stub(twilio, 'getMobileInfo').resolves({ isMobile: true });
    sandbox.stub(phoneNumberVerification, 'send').resolves();
  });
  afterEach(() => clean(sandbox));

  const isSignUp = false;

  it('should use cached contract change data when it exists', async () => {
    await phoneNumberVerification.checkForContractChange(user, isSignUp);
    const result = await phoneNumberVerification.checkForContractChange(user, isSignUp);
    const key = `twilioContractChangeCheck:${user.phoneNumber}`;
    const expirationTime = await redis.ttlAsync(key);

    expect(result.hasTwilioContractChanged).to.be.false;
    expect(expirationTime).to.be.greaterThan(-1);
    sinon.assert.calledOnce(twilioCheckContractStub);
  });

  it('should make a call to Twilio when cached contract change does not exist', async () => {
    const result = await phoneNumberVerification.checkForContractChange(user, isSignUp);
    expect(result.hasTwilioContractChanged).to.be.false;
    sinon.assert.calledOnce(twilioCheckContractStub);
  });
});
