import * as Bluebird from 'bluebird';
import { startCase } from 'lodash';
import amplitude from '../lib/amplitude';
import { dogstatsd } from '../lib/datadog-statsd';
import { TwilioError } from '../lib/error';
import sendgrid from '../lib/sendgrid';
import twilio from '../lib/twilio';
import { formatArrayToString } from '../lib/utils';
import { SideHustleApplication } from '../models';
import { AnalyticsEvent } from '../typings';

/**
 * Send email with tracking links to the user
 */
async function sendSideHustleEmail(
  applicationsWithJobs: SideHustleApplication[],
  userId: number,
  userFirstName: string,
  userEmail: string,
) {
  const subject = 'Side Hustle | Important Job Info';
  const templateId = 'd-8a276c52e9c349e29dbd3bfdf25055a9';
  const formattedApplications = applicationsWithJobs.map(
    ({ id, sideHustleJob: { name, emailBlurb, emailImg, company } }) => ({
      name: startCase(name),
      company,
      blurb: emailBlurb,
      imgSrc: emailImg,
      trackingURL: `https://go.dave.com/r?t=sh&aid=${id}&s=email`,
    }),
  );
  const dynamicTemplateData = {
    name: startCase(userFirstName),
    selectedJobsString: formatArrayToString(
      formattedApplications.map(
        applicationJob =>
          `<a style="color: #212121; text-decoration: underline;" href=${applicationJob.trackingURL}>${applicationJob.company}</a>`,
      ),
    ),
    selectedJobs: formattedApplications,
  };
  const response = await sendgrid.sendDynamic(subject, templateId, dynamicTemplateData, userEmail);

  // If the message was successfully placed in the sendgrid queue, fire amplitude event
  if (response[0].statusCode === 202) {
    amplitude.track({
      eventType: AnalyticsEvent.SideHustleNotificationSent,
      userId,
      eventProperties: {
        source: 'email',
      },
    });
  }
}

/**
 * Send introduction sms to a user before sending tracking links
 */
async function sendIntroSMS(userFirstName: string, userPhoneNumber: string) {
  const introMessage = `Hey ${startCase(
    userFirstName,
  )}, let's lock down that new Side Hustle. Take a few mins now to knock out these applications`;
  await twilio.send(introMessage, userPhoneNumber);
}

/**
 * Send sms with tracking links to a user's phone number
 */
async function sendAffiliatesSMS(
  applicationsWithJobs: SideHustleApplication[],
  userId: number,
  userPhoneNumber: string,
) {
  const sendAffiliateLinks = applicationsWithJobs.map(async application => {
    const trackingURL = `https://go.dave.com/r?t=sh&aid=${application.id}&s=sms&jid=${application.sideHustleJob.id}`;
    const optionalBlurb = application.sideHustleJob.smsBlurb
      ? application.sideHustleJob.smsBlurb + '\n'
      : '';
    const message = `${startCase(
      application.sideHustleJob.company,
    )} - ${optionalBlurb}${trackingURL}`;

    try {
      await twilio.send(message, userPhoneNumber);
      dogstatsd.increment('side_hustle.affiliate_sms_delivery.successful');
    } catch (error) {
      dogstatsd.increment('side_hustle.affiliate_sms_delivery.failed');
      throw new TwilioError(
        `Error sending side hustle sms to userId ${userId} with ${userPhoneNumber}. Affiliate ${application.sideHustleJob.company} never received.`,
        {
          data: error,
          failingService: 'twilio',
          gatewayService: 'node-api',
        },
      );
    }

    amplitude
      .track({
        eventType: AnalyticsEvent.SideHustleNotificationSent,
        userId,
        eventProperties: {
          source: 'sms',
        },
      })
      .catch(() => {});
  });
  await Bluebird.all(sendAffiliateLinks);
}

export default {
  sendAffiliatesSMS,
  sendIntroSMS,
  sendSideHustleEmail,
};
