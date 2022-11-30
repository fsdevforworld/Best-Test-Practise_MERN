import ReactPixel from 'react-facebook-pixel';
import AnalyticsEvent from './analytics-events';

const options = {
  autoConfig: true,
  debug: false,
};
ReactPixel.init('370076790033519', undefined, options);

// https://www.facebook.com/business/help/402791146561655?id=1205376682832142
const standardEvents = {
  [AnalyticsEvent.BANK_CONNECTED]: 'CompleteRegistration',
};

const whitelist = [AnalyticsEvent.BANK_CONNECTED];

export const trackEvent = (event: string, data: Record<string, string | number> = {}) => {
  // only send whitelisted events
  if (!whitelist.includes(event)) {
    return;
  }

  // some events are mapped to standard events
  let eventName = event;
  if (event in standardEvents) {
    eventName = standardEvents[event];
  }

  ReactPixel.track(eventName, data);
};
