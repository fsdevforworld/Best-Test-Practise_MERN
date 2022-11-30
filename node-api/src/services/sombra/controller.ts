import * as UserController from '../../api/v2/user/controller';
import { IDaveRequest, IDaveResponse } from '../../typings';
import * as client from './client';
import {
  validateExchangeRequest,
  validateLoginRequest,
  validateRefreshAccessRequest,
  validateRefreshTokenRequest,
} from './validator';
import { SombraConfig } from './config';
import { SombraMockClient } from './mock';

export async function userAuthenticate(req: IDaveRequest, res: IDaveResponse<any>): Promise<any> {
  const loginPayload = await validateLoginRequest(req);
  const { user, userToken, deviceId } = await UserController.loginUser(loginPayload);
  const response = SombraConfig.isMockEnvironment()
    ? await SombraMockClient.userAuthenticate(user.id)
    : await client.exchangeSession({ userToken, deviceId });
  res.status(response.statusCode).send(response.body);
}

export async function refreshAccess(req: IDaveRequest, res: IDaveResponse<any>): Promise<any> {
  const refreshAccessPayload = await validateRefreshAccessRequest(req);
  const response = await client.refreshAccess(refreshAccessPayload, req);
  res.status(response.statusCode).send(response.body);
}

export async function revoke(req: IDaveRequest, res: IDaveResponse<any>): Promise<any> {
  const revokeAccessPayload = validateRefreshTokenRequest(req);
  const response = await client.revoke(revokeAccessPayload, req);
  res.status(response.statusCode).send(response.body);
}

export async function exchange(req: IDaveRequest, res: IDaveResponse<any>): Promise<any> {
  await validateExchangeRequest(req);
  const response = await client.exchange(req);
  res.status(response.statusCode).send(response.body);
}
