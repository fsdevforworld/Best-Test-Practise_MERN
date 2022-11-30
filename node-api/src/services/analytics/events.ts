import { Integrations } from './types';

/**
 * Note: Using lit in place of enum for conversion from "enum" to union
 * https://stackoverflow.com/questions/52393730/typescript-string-literal-union-type-from-enum/59496175
 * */
const lit = <V extends keyof any>(v: V) => v;
export const Events = {
  // Dave Banking
  DebitCardFundingAccountFundingCompleted: lit('debit card funding account funding completed'),
  DebitCardFundingInitiated: lit('debit card funding initiated'),
  DebitCardFundingInitiatedApplePay: lit('debit card funding initiated apple pay'),
  PayDistributionSuccess: lit('pay distribution success'),
  RdcTransactionUpdatedComplete: lit('rdc transaction updated'),
  // Onboarding
  SharedAccountsUnsupported: lit('shared accounts unsupported'),
  // Advance
  AdvancePaymentReceived: lit('advance payment received'),
  AdvanceDisburseCompleted: lit('advance disburse completed'),
  AdvanceDisburseFailed: lit('advance disburse failed'),
  // User Notifications
  UserNotificationUpdated: lit('user notification updated'),
  MarketingSMSEnabled: lit('marketing sms enabled'),
};

export type Event = typeof Events[keyof typeof Events];

export const Overrides: {
  [key in Event]?: Integrations;
} = {
  [Events.DebitCardFundingAccountFundingCompleted]: { AppsFlyer: true },
  [Events.DebitCardFundingInitiated]: { AppsFlyer: true },
  [Events.DebitCardFundingInitiatedApplePay]: { AppsFlyer: true },
  [Events.PayDistributionSuccess]: { AppsFlyer: true },
  [Events.RdcTransactionUpdatedComplete]: { AppsFlyer: true },
  [Events.SharedAccountsUnsupported]: { Amplitude: true, Braze: true },
  [Events.AdvancePaymentReceived]: { Amplitude: true, Braze: true },
  [Events.AdvanceDisburseCompleted]: { Amplitude: true, Braze: true },
  [Events.AdvanceDisburseFailed]: { Amplitude: true, Braze: true },
  [Events.UserNotificationUpdated]: { Amplitude: true, Braze: true },
  [Events.MarketingSMSEnabled]: { Amplitude: true, Braze: true },
};

export function isEvent(event: string): event is Event {
  return Object.values(Events).includes(event as Event);
}
