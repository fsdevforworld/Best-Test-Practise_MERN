import moment from 'moment';
import { EmailVerificationResponse } from '@dave-inc/wire-typings';
import Braze from '@braze/web-sdk';

import { Config, isDevEnv } from 'lib/config';
import EVENTS from './analytics-events';

type BrazeUser = {
  id: string | number;
  phoneNumber?: string;
  email?: string | null;
  emailVerification?: EmailVerificationResponse | null;
  firstName?: string;
  lastName?: string;
  city?: string;
  birthdate?: string;
};

Braze.initialize(Config.REACT_APP_BRAZE_TOKEN as string, {
  enableLogging: isDevEnv(),
  baseUrl: Config.BRAZE_BASE_URL,
  enableSdkAuthentication: true,
});
Braze.openSession();

const BRAZE_EVENTS = [
  EVENTS.PLAID_DOWN_MODAL_OPENED,
  EVENTS.BANK_CONNECTED,
  EVENTS.INCOME_ADDED_SUCCESS,
];

const standardEvents = {
  [EVENTS.PLAID_DOWN_MODAL_OPENED]: 'plaid down screen loads',
};

export function setUser(user: BrazeUser, token: string) {
  Braze.changeUser(`${user.id}`, token);
  const brazeUser = Braze.getUser();

  if (user.phoneNumber) {
    brazeUser.setPhoneNumber(user.phoneNumber);
  }
  if (user.email || user.emailVerification) {
    const email = user.email || (user.emailVerification && user.emailVerification.email);
    if (email) {
      brazeUser.setEmail(email);
    }
  }
  if (user.firstName) {
    brazeUser.setFirstName(user.firstName);
  }
  if (user.lastName) {
    brazeUser.setLastName(user.lastName);
  }
  if (user.city) {
    brazeUser.setHomeCity(user.city);
  }
  if (user.birthdate) {
    const birthDate = moment(user.birthdate);
    brazeUser.setDateOfBirth(birthDate.year(), birthDate.month(), birthDate.date());
  }
}

export function trackEvent(event: string, eventValues = {}) {
  if (BRAZE_EVENTS.indexOf(event) >= 0) {
    let eventName = event;
    if (event in standardEvents) {
      eventName = standardEvents[event];
    }
    Braze.logCustomEvent(eventName, eventValues);
  }
}
