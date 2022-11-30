import amplitude from 'amplitude-js';
import { toString } from 'lodash';
import { Config } from './config';

type AmplitudeUser = {
  id: number;
};

amplitude.getInstance().init(toString(Config.REACT_APP_AMPLITUDE_TOKEN));

export const trackEvent = (event: string, data: Record<string, string | number | boolean>) => {
  amplitude.getInstance().logEvent(event, data);
};

export const setUser = (user: AmplitudeUser) => {
  amplitude.getInstance().setUserId(String(user.id));
};

export const setUserProperties = (data: Record<string, string | number | boolean>) => {
  amplitude.getInstance().setUserProperties(data);
};
