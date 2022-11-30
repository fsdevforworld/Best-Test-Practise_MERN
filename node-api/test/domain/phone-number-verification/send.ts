import { expect } from 'chai';
import * as sinon from 'sinon';
import * as Notification from '../../../src/domain/notifications';
import phoneNumberVerification from '../../../src/domain/phone-number-verification';
import redis from '../../../src/lib/redis';
import sendgrid from '../../../src/lib/sendgrid';
import twilio from '../../../src/lib/twilio';
import { toE164 } from '../../../src/lib/utils';

describe('send', () => {
  const sandbox = sinon.createSandbox();
  let twilioStub: any;

  before(() => redis.flushallAsync());

  beforeEach(() => {
    twilioStub = sandbox.stub(twilio, 'send');
  });

  afterEach(() => Promise.all([redis.flushallAsync(), sandbox.restore()]));

  const e164PhoneNumber = toE164('1234567890');
  const carrierName = 'at&t';
  const carrierCode = '310|980';

  it('sets phone number as key with code and expiration and increments send count', async () => {
    await phoneNumberVerification.send({ e164PhoneNumber, carrierName, carrierCode });

    const storedCode = await getCode(e164PhoneNumber);
    expect(storedCode).to.exist;
    const sendCount = await getSendCount(e164PhoneNumber);
    expect(sendCount).to.equal(1);

    const ttl = await redis.ttlAsync(e164PhoneNumber);
    expect(ttl).to.be.greaterThan(0);
  });

  it('resending verification and sets delivery method to email_to_sms', async () => {
    const emailSmsStub = sandbox.stub(sendgrid.client, 'send');

    await phoneNumberVerification.send({
      e164PhoneNumber,
      carrierName,
      carrierCode,
    });
    const firstStoredCode = await getCode(e164PhoneNumber);
    await phoneNumberVerification.send({
      e164PhoneNumber,
      carrierName,
      carrierCode,
    });
    const secondStoredCode = await getCode(e164PhoneNumber);
    const sendCount = await getSendCount(e164PhoneNumber);

    expect(firstStoredCode).to.not.equal(secondStoredCode);
    expect(sendCount).to.equal(2);
    sinon.assert.calledOnce(twilioStub);
    sinon.assert.calledOnce(emailSmsStub);
  });

  it('sets delivery method to email when email address is provided', async () => {
    const email = 'user@user.com';
    const emailStub = sandbox.stub(Notification, 'sendVerificationCode');

    await phoneNumberVerification.send({ e164PhoneNumber, carrierName, carrierCode, email });

    sinon.assert.calledOnce(emailStub);
  });

  it('sets delivery method to email when email address is provided, even if send count > 1', async () => {
    const email = 'user@user.com';
    const stub = sandbox.stub(Notification, 'sendVerificationCode');

    await Promise.all([
      phoneNumberVerification.send({ e164PhoneNumber, carrierName, carrierCode, email }),
      phoneNumberVerification.send({ e164PhoneNumber, carrierName, carrierCode, email }),
    ]);

    sinon.assert.called(stub);
    sinon.assert.notCalled(twilioStub);
  });
});

function getCode(key: string): Promise<string> {
  return redis.hgetAsync(key, 'code');
}

async function getSendCount(key: string): Promise<number> {
  const count = await redis.hgetAsync(key, 'sendCount');
  // tslint:disable-next-line: radix
  return parseInt(count);
}
