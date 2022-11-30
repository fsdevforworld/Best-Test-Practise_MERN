import { IDaveRequest } from '../../typings';

export type ValidRefreshTokenPayload = {
  refreshToken: string;
};

export type ValidExchangeSessionPayload = {
  accessToken?: string;
  refreshToken?: string;
};

export interface IExchangeSessionRequest extends Partial<IDaveRequest> {
  userToken: string;
  deviceId: string;
}

export interface IRefreshTokenRequest extends Partial<IDaveRequest> {
  refreshToken: string;
}

export interface ISombraResponse {
  statusCode: number;
  body: any;
}
