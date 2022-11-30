import { ForecastJsonResponse } from '@dave-inc/wire-typings';

export type ForecastEventInput = {
  userId: number;
  bankAccountId: number;
  balanceAfterPending: number;
  bankName: string;
  newForecast: ForecastJsonResponse;
  lastForecast: ForecastJsonResponse;
  lowBalanceThreshold: number | null;
};
