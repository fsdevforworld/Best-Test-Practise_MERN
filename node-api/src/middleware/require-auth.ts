// ʕ•ᴥ•ʔ www.dave.com ʕ•ᴥ•ʔ
//                                   caw
//                            __\\O<   caw
//                               K
//              ____
//      snek   / . .\
// snek        \  ---<
//      snek    \  /
//    __________/ /
// -=:___________/

import { get } from 'lodash';
import { Response, NextFunction } from 'express';
import {
  createTokenIntrospectionInstance,
  IntrospectRequest,
} from '@dave-inc/sombra-token-validator';

import { getLanguage, setUserLocale } from '../domain/user-setting/locale';
import { setUserTimezone } from '../domain/user-setting/timezone';
import {
  InvalidCredentialsError,
  InvalidSessionError,
  MissingHeadersError,
  UnauthorizedError,
} from '../lib/error';
import { setRedisUserSession, getRedisUserSession } from '../lib/user-sessions';
import { Role, User, UserAppVersion, UserIpAddress, UserSession } from '../models';
import { IDaveRequest } from '../typings';
import {
  InvalidParametersMessageKey,
  NotFoundMessageKey,
  InvalidCredentialsMessageKey,
} from '../translations';
import logger from '../lib/logger';
import * as config from 'config';
import { dogstatsd } from '../lib/datadog-statsd';

const tokenIntrospection = createTokenIntrospectionInstance(config);
export const introspectRequestAsync = IntrospectRequest({
  tokenIntrospection,
  logger,
  metrics: dogstatsd,
});

// authentication middleware
// this is an interim step where both sombra and legacy authorization are supported.
// This entire middleware will eventually be completely replaced with sombra's token-validator middleware
export default async function(req: IDaveRequest, res: Response, next: NextFunction) {
  if (req.method === 'OPTIONS') {
    return next();
  }

  const sessionCookie = get(req, 'signedCookies.user', {});

  const token = req.get('Authorization') || sessionCookie.authorization;
  const deviceId = req.get('X-Device-Id') || sessionCookie.deviceId;
  const deviceType = req.get('X-Device-Type') || sessionCookie.deviceType;
  const appVersion = req.get('X-App-Version') || sessionCookie.appVersion;
  const sombraAccessToken = req.get('X-Access-Token'); // sombra auth not stored in sessionCookie

  const hasLegacyAuth: boolean = token !== undefined && deviceId !== undefined;
  const hasSombraAuth: boolean = sombraAccessToken !== undefined;
  if (!hasLegacyAuth && !hasSombraAuth) {
    return next(
      new MissingHeadersError(null, {
        required: ['x-device-id', 'authorization', 'x-access-token'],
        provided: Object.keys(req.headers),
      }),
    );
  }

  // note redis checking/storing of sessions is deprecated, will go away when migration to sombra auth complete
  // note we're not going to store a user session in mysql for users with sombra auth
  let userIdFromSombraToken: number;
  if (hasSombraAuth) {
    const tokenIntrospectionResult = await introspectRequestAsync(req);
    if (tokenIntrospectionResult.success) {
      userIdFromSombraToken = tokenIntrospectionResult.user.id;
    } else {
      return next(new InvalidCredentialsError(InvalidCredentialsMessageKey.InvalidAuthToken));
    }
  }

  let existingSessionUserId;
  if (!userIdFromSombraToken) {
    try {
      existingSessionUserId = await getRedisUserSession(deviceId, token);
    } catch (e) {
      existingSessionUserId = null;
    }
  }
  let user;
  let usedSessionCache = false;
  if (!existingSessionUserId && !userIdFromSombraToken) {
    const result = await UserSession.findOne({ where: { deviceId, token } });
    if (!result) {
      return next(
        new InvalidSessionError(NotFoundMessageKey.SessionNotFoundByDeviceId, {
          name: 'InvalidSession',
          interpolations: { deviceId },
        }),
      );
    }
    const userIdFromSQL = result.userId;

    user = await User.findByPk(userIdFromSQL, { include: [Role] });
    await setRedisUserSession(deviceId, token, userIdFromSQL.toString());
  } else {
    let userIdForQuery;
    if (existingSessionUserId) {
      usedSessionCache = true;
      userIdForQuery = existingSessionUserId;
    } else {
      userIdForQuery = userIdFromSombraToken;
    }
    user = await User.findByPk(userIdForQuery, { include: [Role] });
  }

  if (!user) {
    return next(
      new InvalidCredentialsError(InvalidParametersMessageKey.DeleteRequestAlreadyProcessed, {
        name: 'UserDeleted',
      }),
    );
  }

  UserIpAddress.upsert({
    ipAddress: req.ip,
    userId: user.id,
    lastSeen: new Date(),
  }).catch(() => {});

  if (appVersion && deviceType) {
    UserAppVersion.upsert({
      appVersion,
      deviceType,
      userId: user.id,
      lastSeen: new Date(),
    }).catch(() => {});
  }

  await _handleLocaleHeaders(req, user.id);

  if (user.fraud) {
    logger.warn(
      `[RequireAuth] User has been flagged as fraud, blocking request. (Request ID = ${req.requestID} | Path = ${req.path})`,
    );
    return next(new UnauthorizedError(InvalidParametersMessageKey.PleaseContactCustomerService));
  }

  req.userToken = token;
  req.usedSessionCache = usedSessionCache;
  req.user = user;

  await _handleTimezone(req, user.id);

  next();
}

async function _handleTimezone(req: IDaveRequest, userId: number): Promise<void> {
  const timezone = req.get('X-Timezone');
  if (timezone) {
    await setUserTimezone(userId, timezone);
  }
}

async function _handleLocaleHeaders(req: IDaveRequest, userId: number): Promise<void> {
  const { locale = '' } = req.headers;
  const localeCode = locale instanceof Array ? locale[0] : locale;

  const language = getLanguage(localeCode);
  if (!language) {
    return;
  }

  await setUserLocale(userId, localeCode, language);
  if (req.i18n) {
    req.i18n.changeLanguage(language);
  }
}
