import EVENTS from 'lib/analytics-events';

type AppsflyerUser = {
  id: number;
};

const APPSFLYER_EVENTS = [
  EVENTS.PHONE_NUMBER_VERIFICATION_SUCCESS,
  EVENTS.PLAID_OPENED,
  EVENTS.BANK_CONNECTED,
  EVENTS.INCOME_ADDED_SUCCESS,
];

export const setUser = (user: AppsflyerUser) => {
  // @ts-ignore
  window.AF('pba', 'event', { eventType: 'IDENTIFY', customUserId: `${user.id}` });
};

export function trackEvent(event: string) {
  if (APPSFLYER_EVENTS.indexOf(event) >= 0) {
    // @ts-ignore
    window.AF('pba', 'event', { eventType: 'EVENT', eventName: event });
  }
}
