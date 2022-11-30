import { Response } from 'express';
import { AnalyticsEvent, IDaveRequest } from '../typings';
import { SideHustleApplication, SideHustleJob } from '../models';
import { Status } from '../models/side-hustle-application';

import braze from '../lib/braze';
import { moment } from '@dave-inc/time-lib';
import amplitude from '../lib/amplitude';
import { dogstatsd } from '../lib/datadog-statsd';

interface IRedirectQueryParams {
  t: string; // type
  aid: number; // side hustle application id
  s: string; // source
  [customAttribute: string]: any;
}

async function getRedirectURL(queryParameters: IRedirectQueryParams): Promise<string> {
  if (queryParameters.t === 'sh') {
    return onSideHustleLinkClick(queryParameters);
  } else {
    return 'https://www.dave.com';
  }
}

/**
 * Perform logic and redirect to another URL
 */
async function redirect(req: IDaveRequest, res: Response) {
  // We're seeing ununual activity on the side hustle redirects with a bunch of HEAD requests so we want to isolate these
  // and not treat these as normal redirect GET requests
  if (req.method === 'HEAD') {
    dogstatsd.increment('redirect.head_request_received');
    res.end();
    return;
  }

  // Run the appropriate method for the type of redirect
  const redirectURL = await getRedirectURL(req.query);

  // Redirect to URL
  res.redirect(redirectURL);
}

async function onSideHustleLinkClick(queryParameters: IRedirectQueryParams): Promise<string> {
  const { aid: applicationId, s: source } = queryParameters;

  // Change the status to 'CLICKED' for the application
  const application = await SideHustleApplication.findByPk(applicationId, {
    include: [SideHustleJob],
  });
  await application.update({ status: Status.CLICKED });

  const brazeEvent = {
    name: AnalyticsEvent.SideHustleNotificationClicked,
    externalId: `${application.userId}`,
    properties: {
      job: application.sideHustleJob.company,
    },
    time: moment(),
  };

  const amplitudeEvent = {
    eventType: AnalyticsEvent.SideHustleNotificationClicked,
    userId: application.userId,
    eventProperties: {
      job: application.sideHustleJob.company,
      source,
    },
  };

  // Fire amplitude and braze event for link clicked
  await Promise.all([braze.track({ events: [brazeEvent] }), amplitude.track(amplitudeEvent)]);

  // Return the affiliate link URL to redirect to
  const affiliateLink = application.sideHustleJob.affiliateLink.replace(
    'USER_ID',
    application.userId.toString(),
  );
  return affiliateLink;
}

export default redirect;
