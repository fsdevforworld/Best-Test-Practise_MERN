import { useEffect } from 'react';
import useReactRouter from 'use-react-router';
import seedrandom from 'seedrandom';

import { Config } from 'lib/config';
import { choice } from 'lib/random';
import { AnalyticsUser, AnalyticsData } from 'typings/analytics';

import * as Amplitude from './amplitude';
import * as Appsflyer from './appsflyer';
import * as Braze from './braze';
import * as Facebook from './facebook';
import { getDeviceId } from './device';

import { default as EVENTS } from './analytics-events';

const { REACT_APP_VARIANT: VARIANT } = process.env;

export const trackEvent = (event: string, data: AnalyticsData = {}) => {
  const { pathname } = window.location;
  if (Config.REACT_APP_ENVIRONMENT === 'dev') {
    // eslint-disable-next-line no-console
    console.debug(event, data);
  }

  const dataWithWebContext = {
    ...data,
    url: pathname,
    domain: 'web',
  };

  Amplitude.trackEvent(event, dataWithWebContext);
  Appsflyer.trackEvent(event);
  Braze.trackEvent(event, dataWithWebContext);
  Facebook.trackEvent(event, dataWithWebContext);
};

const DEFAULT_DATA: AnalyticsData = {};
export function useAnalytics(screenName: string, data: AnalyticsData = DEFAULT_DATA) {
  const { location } = useReactRouter();
  useEffect(() => {
    if (screenName) {
      trackEvent(screenName, data);
    }
  }, [screenName, data, location]);
}

export const setUserProperties = (props: AnalyticsData) => {
  Amplitude.setUserProperties(props);
};

export const setUser = (user: AnalyticsUser) => {
  Amplitude.setUser(user);
  Appsflyer.setUser(user);
};

export const setDeviceContext = async () => {
  const deviceId = getDeviceId();
  setUserProperties({ deviceId });
};

export function getVariant<T = string>(
  key: string,
  values: T[],
  probabilities?: number[],
  control?: T,
) {
  // always return control if circle ci
  if (Config.REACT_APP_ENVIRONMENT === 'CI' && control) {
    return control;
  }

  // allows internal tester to supply a given variant
  // export REACT_APP_VARIANT="key|value;key2|value2" && yarn start
  const ENV_VALUES: { [key: string]: string } =
    (VARIANT &&
      VARIANT.split(';').reduce((acc: { [key: string]: string }, item) => {
        const [k, v] = item.split('|');
        acc[k] = v;
        return acc;
      }, {})) ||
    {};

  if (key in ENV_VALUES) {
    return (ENV_VALUES[key] as unknown) as T;
  }

  const deviceId = getDeviceId();
  const variantSeed = process.env.VARIANT_SEED || deviceId;
  const randomFn = seedrandom(`${variantSeed}-${key}`); // get the same result every time

  return choice(values, probabilities, randomFn);
}

export { EVENTS };
