import * as Amplitude from './amplitude';
import * as AppsFlyer from './appsflyer';
import * as Braze from './braze';
import { IIntegration, Integrations } from '../types';

export const integrationMap: { [key in keyof Integrations]: IIntegration } = {
  Amplitude,
  AppsFlyer,
  Braze,
};

export const integrations: Array<keyof Integrations> = ['Amplitude', 'AppsFlyer', 'Braze'];
