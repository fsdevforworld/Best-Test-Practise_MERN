import deliver from '../../../src/domain/phone-number-verification/deliver';
import * as sinon from 'sinon';
import { expect } from 'chai';
import twilio from '../../../src/lib/twilio';
import sendgrid from '../../../src/lib/sendgrid';
import * as Notification from '../../../src/domain/notifications';
import { toE164 } from '../../../src/lib/utils';
import {
  PhoneNumberVerification,
  PhoneNumberVerificationDeliveryMethod,
} from '../../../src/typings';
import { InvalidParametersError } from '../../../src/lib/error';
import { dogstatsd } from '../../../src/lib/datadog-statsd';

describe('deliver', () => {
  const sandbox = sinon.createSandbox();
  const e164PhoneNumber = toE164('1234567890');
  const verification: PhoneNumberVerification = {
    code: '1234',
    carrierName: 'sprint',
    carrierCode: '312|530',
  };
  const msgRegex = /.+verification code.+\d{4}.+expire.+\d{1,2} minutes.+/;
  const emailRegex = /^\d{10}\@.+\.(com|net)$/;

  afterEach(() => sandbox.restore());

  it('sends SMS when delivery type is SMS', async () => {
    const twilioStub = sandbox.stub(twilio, 'send');
    const emailStub = sandbox.stub(Notification, 'sendVerificationCode');
    await deliver({
      e164PhoneNumber,
      verification,
      deliveryMethod: PhoneNumberVerificationDeliveryMethod.SMS,
    });

    sinon.assert.calledWith(twilioStub, sinon.match(msgRegex), e164PhoneNumber);
    sinon.assert.calledOnce(twilioStub);
    sinon.assert.notCalled(emailStub);
  });

  it('sends email when delivery type is email', async () => {
    const email = 'user@user.com';
    const twilioStub = sandbox.stub(twilio, 'send');
    const emailStub = sandbox.stub(Notification, 'sendVerificationCode');
    await deliver({
      e164PhoneNumber,
      verification,
      deliveryMethod: PhoneNumberVerificationDeliveryMethod.EMAIL,
      email,
    });

    sinon.assert.calledWith(emailStub, email, sinon.match(msgRegex));
    sinon.assert.calledOnce(emailStub);
    sinon.assert.notCalled(twilioStub);
  });

  it('throws an error when delivery type is email and no email is provided', async () => {
    let error;
    try {
      await deliver({
        e164PhoneNumber,
        verification,
        deliveryMethod: PhoneNumberVerificationDeliveryMethod.EMAIL,
      });
    } catch (ex) {
      error = ex;
    }

    expect(error).to.be.instanceof(InvalidParametersError);
  });

  context('delivery method is email to sms', () => {
    beforeEach(() => sandbox.stub(dogstatsd, 'increment'));
    it('sends sms email', async () => {
      const twilioStub = sandbox.stub(twilio, 'send');
      const smsEmailStub = sandbox.stub(sendgrid.client, 'send');
      await deliver({
        e164PhoneNumber,
        verification,
        deliveryMethod: PhoneNumberVerificationDeliveryMethod.EMAIL_TO_SMS,
      });

      sinon.assert.calledWith(
        smsEmailStub,
        sinon.match({
          to: sinon.match(emailRegex),
          subject: 'Dave Verification Code',
          from: 'dave@dave.com',
          text: sinon.match(msgRegex),
        }),
      );
      sinon.assert.calledOnce(smsEmailStub);
      sinon.assert.notCalled(twilioStub);
    });

    it('sends sms text when carrier does not support sms emails', async () => {
      const twilioStub = sandbox.stub(twilio, 'send');
      const smsEmailStub = sandbox.stub(sendgrid.client, 'send');
      const notFoundVerification = { code: '1234', carrierName: 'noSMS', carrierCode: 'noCode' };
      await deliver({
        e164PhoneNumber,
        verification: notFoundVerification,
        deliveryMethod: PhoneNumberVerificationDeliveryMethod.EMAIL_TO_SMS,
      });

      sinon.assert.notCalled(smsEmailStub);
      sinon.assert.calledWith(twilioStub, sinon.match(msgRegex), e164PhoneNumber);
      sinon.assert.calledOnce(twilioStub);
    });

    it('sends sms text when sms email fails', async () => {
      const twilioStub = sandbox.stub(twilio, 'send');
      const smsEmailStub = sandbox.stub(sendgrid.client, 'send').throws();
      sandbox.stub(console);
      await deliver({
        e164PhoneNumber,
        verification,
        deliveryMethod: PhoneNumberVerificationDeliveryMethod.EMAIL_TO_SMS,
      });

      sinon.assert.calledWith(
        smsEmailStub,
        sinon.match({
          to: sinon.match(emailRegex),
          subject: 'Dave Verification Code',
          from: 'dave@dave.com',
          text: sinon.match(msgRegex),
        }),
      );
      sinon.assert.calledWith(twilioStub, sinon.match(msgRegex), e164PhoneNumber);
    });
  });
});
