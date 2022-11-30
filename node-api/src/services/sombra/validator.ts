import { IDaveRequest } from '../../typings';
import { ValidLoginPayload } from '../../api/v2/user/typings';
import {
  CUSTOM_ERROR_CODES,
  InvalidCredentialsError,
  InvalidParametersError,
  SombraUnexpectedError,
  UnauthenticatedError,
} from '../../lib/error';
import { InvalidParametersMessageKey, RateLimitMessageKey } from '../../translations';
import { checkIpRateLimit } from '../../api/v2/user/check-ip-rate-limit';
import {
  checkRateLimit,
  createRateLimiter,
  getRemainingLoginAttemptsFromDeviceId,
  loginRateLimitKey,
  loginRateLimitRules,
} from '../../api/v2/user/rate-limit';
import { User } from '../../models';
import { dogstatsd } from '../../lib/datadog-statsd';
import { ValidRefreshTokenPayload } from './typings';
import { toE164, validPhoneNumberRegex } from '../../lib/utils';
import * as Joi from 'joi';
import {
  CoreAccountStatus,
  getCoreAccountStatus,
} from '../../domain/account-management/account-status';
import {
  createTokenIntrospectionInstance,
  InternalFailure,
} from '@dave-inc/sombra-token-validator';
import * as config from 'config';
import logger from '../../lib/logger';

const tokenIntrospection = createTokenIntrospectionInstance(config)
  .withLogger(logger)
  .withMetrics(dogstatsd);

type LoginMethod = EmailLoginMethod | PhoneLoginMethod | InvalidLoginMethod;
type EmailLoginMethod = {
  loginMethod: 'email';
  email: string;
  password: string;
  deviceId: string;
  deviceType: string;
  mfaCode?: string;
};

type PhoneLoginMethod = {
  loginMethod: 'phoneNumber';
  phoneNumber: string;
  password: string;
  deviceId: string;
  deviceType: string;
  mfaCode?: string;
};

type InvalidLoginMethod = {
  loginMethod: 'invalid';
  rules: string[];
};

export async function validateExchangeRequest(req: IDaveRequest): Promise<void> {
  const { ip } = req;
  const deviceId = req.get('X-Device-Id');

  await checkIpRateLimit(ip, RateLimitMessageKey.TooManyFailedLoginAttemptsTryLater);

  const rateLimitValues = { deviceId };
  const rateLimiter = createRateLimiter(loginRateLimitKey, loginRateLimitRules);
  await checkRateLimit({
    rateLimiter,
    rateLimitValues,
    errorMessage: RateLimitMessageKey.TooManyFailedLoginAttemptsTryLater,
    prefix: loginRateLimitKey,
    ip,
  });
}

const loginSchema = Joi.object({
  email: Joi.string()
    .when('phoneNumber', { is: Joi.exist(), then: Joi.forbidden() })
    .when('phoneNumber', { not: Joi.exist(), then: Joi.required() }),
  phoneNumber: Joi.string().pattern(validPhoneNumberRegex),
  password: Joi.string().required(),
  mfaCode: Joi.string().optional(),
  deviceId: Joi.string()
    .required()
    .label('X-Device-Id'),
  deviceType: Joi.string()
    .required()
    .label('X-Device-Type'),
});

function getLoginMethod(
  email?: any,
  phoneNumber?: any,
  password?: any,
  mfaCode?: any,
  deviceId?: any,
  deviceType?: any,
): LoginMethod {
  const validation = loginSchema.validate(
    {
      email,
      phoneNumber,
      password,
      mfaCode,
      deviceId,
      deviceType,
    },
    { abortEarly: false },
  );
  if (!validation.error) {
    if (email) {
      return { loginMethod: 'email', email, password, mfaCode, deviceId, deviceType };
    } else {
      return {
        loginMethod: 'phoneNumber',
        phoneNumber: toE164(phoneNumber),
        password,
        mfaCode,
        deviceId,
        deviceType,
      };
    }
  } else {
    const rules = validation.error.details.map(each => each.context?.key ?? 'key-undefined');
    return { loginMethod: 'invalid', rules };
  }
}

function incrementAuthenticationType(login: LoginMethod): void {
  if (login.loginMethod === 'email') {
    dogstatsd.increment('sombra.user_authenticate.type.email');
  } else if (login.loginMethod === 'phoneNumber') {
    dogstatsd.increment('sombra.user_authenticate.type.phoneNumber');
  } else if (login.loginMethod === 'invalid') {
    dogstatsd.increment('sombra.user_authenticate.type.invalid', login.rules);
  }
}

export async function validateLoginRequest(req: IDaveRequest): Promise<ValidLoginPayload> {
  const deviceId: string | undefined = req.get('X-Device-Id');
  const deviceType: string | undefined = req.get('X-Device-Type');
  const {
    ip,
    body: { email, phoneNumber, password, mfaCode },
  } = req;
  const login = getLoginMethod(email, phoneNumber, password, mfaCode, deviceId, deviceType);

  incrementAuthenticationType(login);

  if (login.loginMethod === 'invalid') {
    throw new InvalidParametersError(InvalidParametersMessageKey.InvalidLogin);
  }

  await checkIpRateLimit(ip, RateLimitMessageKey.TooManyFailedLoginAttemptsTryLater);

  const rateLimitValues =
    login.loginMethod === 'email'
      ? { email: login.email, deviceId: login.deviceId }
      : { phoneNumber: login.phoneNumber, deviceId: login.deviceId };
  const rateLimiter = createRateLimiter(loginRateLimitKey, loginRateLimitRules);
  await checkRateLimit({
    rateLimiter,
    rateLimitValues,
    errorMessage: RateLimitMessageKey.TooManyFailedLoginAttemptsTryLater,
    prefix: loginRateLimitKey,
    ip,
  });
  const attemptsRemaining = await getRemainingLoginAttemptsFromDeviceId(
    rateLimitValues,
    loginRateLimitKey,
  );

  let user: User | null | undefined;
  if (login.loginMethod === 'phoneNumber') {
    user = await User.findOneByPhoneNumber(login.phoneNumber);
  } else {
    user = await User.findOneByEmail(login.email);
  }

  if (!user) {
    dogstatsd.increment('sombra.user_authenticate.failure.unknown_user');
    throw new InvalidCredentialsError('Credentials provided are invalid.', {
      name: 'invalid_credentials',
      customCode: CUSTOM_ERROR_CODES.USER_INVALID_CREDENTIALS,
    });
  }
  return {
    ...login,
    user,
    attemptsRemaining,
  };
}

export function validateRefreshTokenRequest(req: IDaveRequest): ValidRefreshTokenPayload {
  const refreshToken = req.get('X-Refresh-Token');
  if (!refreshToken) {
    dogstatsd.increment('sombra.refresh_token_validate.failure.missing');
    throw new InvalidParametersError(null, {
      required: ['X-Refresh-Token'],
      provided: [],
    });
  }
  dogstatsd.increment('sombra.refresh_token_validate.success');
  return { refreshToken };
}

export async function validateRefreshAccessRequest(
  req: IDaveRequest,
): Promise<ValidRefreshTokenPayload> {
  const { refreshToken } = validateRefreshTokenRequest(req);

  let userId: number | undefined;
  try {
    const response = await tokenIntrospection.introspectRefreshToken(refreshToken);
    userId = response.userId;
  } catch (e) {
    if (e instanceof InternalFailure) {
      logger.debug(`[Validate-Refresh-Access] - Internal error: ${e.message}`);
      dogstatsd.increment(`sombra.refresh_access_validate.failure.invalid_token.${e.failure}`);
      throw new UnauthenticatedError();
    } else {
      logger.error(`[Validate-Refresh-Access] - Unexpected error: ${e.message}`);
      dogstatsd.increment('sombra.refresh_access_validate.failure.unexpected_error');
      throw new SombraUnexpectedError();
    }
  }
  const result = await getCoreAccountStatus(userId);
  if (result.status === CoreAccountStatus.ACTIVE) {
    logger.debug(`[Validate-Refresh-Access] - UserId ${userId} is active`);
    dogstatsd.increment('sombra.refresh_access_validate.success');
    return { refreshToken };
  } else if (result.status === CoreAccountStatus.FRAUD) {
    logger.debug(`[Validate-Refresh-Access] - UserId ${userId} marked as fraud`);
    dogstatsd.increment('sombra.refresh_access_validate.failure.user_fraud');
    throw new UnauthenticatedError(InvalidParametersMessageKey.PleaseContactCustomerService);
  } else if (result.status === CoreAccountStatus.DELETED) {
    logger.debug(`[Validate-Refresh-Access] - UserId ${userId} is deleted`);
    dogstatsd.increment('sombra.refresh_access_validate.failure.user_deleted');
    throw new UnauthenticatedError(InvalidParametersMessageKey.DeleteRequestAlreadyProcessed, {
      name: 'UserDeleted',
    });
  }
}
