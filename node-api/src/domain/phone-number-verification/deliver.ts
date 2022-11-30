import twilioClient from '../../lib/twilio';
import sendgrid from '../../lib/sendgrid';
import { PhoneNumberVerification, PhoneNumberVerificationDeliveryMethod } from '../../typings';
import formatPhoneNumberWithCarrierDomain from './carriers';
import * as moment from 'moment';
import * as config from 'config';
import * as Notification from '../../domain/notifications';
import { InvalidParametersError } from '../../lib/error';
import { dogstatsd } from '../../lib/datadog-statsd';
import logger from '../../lib/logger';

const codeTtl = config.get<number>('phoneNumbers.verificationTtl');
const codeTtlFormatted = moment.duration(codeTtl, 'seconds').humanize();

export default async function deliver({
  e164PhoneNumber,
  verification,
  deliveryMethod,
  email,
}: {
  e164PhoneNumber: string;
  verification: PhoneNumberVerification;
  deliveryMethod: PhoneNumberVerificationDeliveryMethod;
  email?: string;
}): Promise<void> {
  const message = `Here's your Dave verification code: ${verification.code}. This code will expire in ${codeTtlFormatted}.`;

  switch (deliveryMethod) {
    case PhoneNumberVerificationDeliveryMethod.EMAIL:
      if (!email) {
        throw new InvalidParametersError(
          `Email is required for delivery method: ${deliveryMethod}`,
        );
      }
      await Notification.sendVerificationCode(email, message);
      return;
    case PhoneNumberVerificationDeliveryMethod.EMAIL_TO_SMS:
      const emailAddressForSms = formatPhoneNumberWithCarrierDomain(
        e164PhoneNumber,
        verification.carrierName,
        verification.carrierCode,
      );
      const tags = {
        carrier_name: verification.carrierName,
        carrier_code: verification.carrierCode,
      };
      if (emailAddressForSms) {
        dogstatsd.increment(
          'phone_number_verification.email_to_sms.carrier_lookup.successful',
          tags,
        );
        const subject = 'Dave Verification Code';
        const from = 'dave@dave.com';
        try {
          await sendgrid.client.send({
            subject,
            from,
            to: emailAddressForSms,
            text: message,
          });
          return;
        } catch (e) {
          logger.error('Error sending email', {
            subject,
            to: emailAddressForSms,
            e,
            body: e.response && e.response.body,
          });
          dogstatsd.increment('phone_number_verification.email_to_sms.delivery.failed', tags);
        }
      } else {
        dogstatsd.increment('phone_number_verification.email_to_sms.carrier_lookup.failed', tags);
      }
    default:
      await twilioClient.send(message, e164PhoneNumber);
  }
}
