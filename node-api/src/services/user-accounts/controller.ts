import * as UserController from '../../api/v2/user/controller';
import { IDaveRequest, IDaveResponse } from '../../typings';
import * as UserValidator from '../../api/v2/user/validator';
import * as UserSerializer from '../../api/v2/user/serializer';
import * as sombraClient from '../../../src/services/sombra/client';
import logger from '../../lib/logger';
import { SombraSessionExchangeFailure } from '../../lib/error';
import { omit, omitBy, isNil } from 'lodash';
import { setRedisUserSession } from '../../lib/user-sessions';

export async function registerUserAccount(
  req: IDaveRequest,
  res: IDaveResponse<any>,
): Promise<void> {
  const createUserPayload = await UserValidator.validateNewUserRequest(req);

  const appVersion: string = req.get('X-App-Version');
  const deviceId: string = req.get('X-Device-Id');

  try {
    const { user, userToken } = await UserController.createUser(appVersion, createUserPayload);

    const userResponse = UserSerializer.serializeUserResponse({
      ...createUserPayload,
      userEmail: user.email,
      userToken,
      user,
    } as any);

    await setRedisUserSession(deviceId, userToken, user.id.toString());

    const {
      body: { accessToken, refreshToken },
    } = await sombraClient
      .exchangeSession({
        userToken,
        deviceId,
      })
      .catch(error => {
        const errorMessage = `Error exchanging session token during registration for user. ${error?.message ||
          error}`;
        logger.error(errorMessage, error);
        throw new SombraSessionExchangeFailure(errorMessage);
      });

    const registerResponse = omitBy(
      {
        ...omit(userResponse, 'userToken', 'token'),
        accessToken,
        refreshToken,
      },
      isNil,
    );

    logger.debug(`[UserAccount] Registration Completed. Response Logged.`, registerResponse);

    res.status(200).send(registerResponse);
  } catch (ex) {
    const shortReqId = req.requestID.slice(0, 8);
    const errorMsg = `Registration Error! Please contact customer support. Reference ID: ${shortReqId}`;
    logger.error(
      `[UserAccount] ${errorMsg} (Likely Blocked By Fraud) | Message: ${ex.message}`,
      ex,
    );
    res.status(500);
    res.send({ message: errorMsg });
  }
}
