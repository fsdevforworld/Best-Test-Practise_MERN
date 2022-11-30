// error-handling middleware
import * as uuidv4 from 'uuid/v4';
import * as httpErrors from 'http-errors';
import { BaseApiError, BaseDaveApiError, BankingDirectError } from '../lib/error';
import { IDaveRequest } from '../typings';
import { Response, NextFunction } from 'express';
import { isDevEnv } from '../lib/utils';
import logger from '../lib/logger';
import ErrorHelper from '@dave-inc/error-helper';
import { MiddlewareErrorKey } from '../translations';
import { omitBy, isNil } from 'lodash';

function errorMungerMiddleware(
  error: BaseDaveApiError,
  req: IDaveRequest,
  res: Response,
  next: NextFunction,
) {
  if (error.name === 'PaymentError' && error.message.includes('exceeded your transaction limit')) {
    logger.error('Exceeded transaction limit', { error });
    throw new BaseApiError(
      "So emBEARassing! Advances aren't available right now. Please try again in 24 hours.",
      {
        statusCode: 500,
        showUuid: false,
        name: 'ProviderLimitExceeded',
      },
    );
  }
  next(error);
}

function errorHandlerMiddleware(
  error: Error,
  req: IDaveRequest,
  res: Response,
  next: NextFunction,
): Response {
  const errorId = uuidv4().slice(0, 8);
  const loggingPayload: any = {
    error,
    errorId,
    url: req.url,
    method: req.method,
    endpoint: req.route ? req.route.path : req.originalUrl,
    uncaught: !(error instanceof BaseDaveApiError),
  };

  //TODO: remove this once we know what's going on w/ duplicated requests
  if (req.errorCount) {
    req.errorCount += 1;
  } else {
    req.errorCount = 1;
  }
  loggingPayload.errorCount = req.errorCount;

  loggingPayload.ip = req.ip;

  const deviceId = req.get('X-Device-Id');

  if (deviceId) {
    loggingPayload.deviceId = deviceId;
  }

  if (req.user) {
    loggingPayload.userId = req.user.id;
  }

  if (req.get('X-App-Version')) {
    loggingPayload.appVersion = req.get('X-App-Version');
  }

  if (req.get('X-App-Screen')) {
    loggingPayload.appScreen = req.get('X-App-Screen');
  }

  const requestID = req.requestID || req.get('X-Request-Id');
  if (requestID) {
    loggingPayload.requestID = requestID;
  }

  if (error instanceof BankingDirectError) {
    const { statusCode } = error;
    let { data } = error;
    data = omitBy(data, isNil);
    logPayload({ status: statusCode, ...loggingPayload });
    return res.status(statusCode).send(data);
  } else if (error instanceof BaseDaveApiError) {
    const { message, customCode, statusCode, interpolations } = error;
    let { data } = error;
    data = omitBy(data, isNil);
    const translate = !!req.t ? req.t : (key: string, _interpolations?: any) => key;
    // only translate messages that use an enumified key defined in `translations/index`
    // this way anyone who passes in error messages the old way won't have to worry
    // about conforming to the i18n API
    const formattedMessage =
      message.split(' ').length === 1 ? translate(message, interpolations) : message;

    loggingPayload.error.message = formattedMessage;

    logPayload({ status: statusCode, ...loggingPayload });

    const fullMessage =
      formattedMessage +
      (error.showUuid ? `\n${translate(MiddlewareErrorKey.SendErrorId)}: ${errorId}` : '');

    return res.status(statusCode).send({
      type: error.repr(),
      message: fullMessage,
      customCode,
      data,
    });
  } else if (httpErrors.isHttpError(error)) {
    // body-parser uses http-errors
    // https://github.com/expressjs/body-parser#errors
    const wrappedError = new BaseDaveApiError(error.name, {
      data: { originalError: ErrorHelper.logFormat(error) },
      statusCode: error.statusCode,
    });
    logger.error(wrappedError.message, { error: wrappedError });
    return res.sendStatus(wrappedError.statusCode);
  } else if (isDevEnv()) {
    logPayload(loggingPayload);
    // sends error stack across the wire in development only
    return res.status(500).send({
      stack: error,
      type: 'internal_error',
      message: 'An uncaught error occurred',
      customCode: 5001,
    });
  } else {
    const status = 500;
    logPayload({ status, ...loggingPayload });
    // sends a generic 500 error for all uncaught exceptions
    return res.status(status).send({
      type: 'internal_error',
      message: `Oops, error! Send us this ID if you need help:\n${errorId}`,
      customCode: 5001,
    });
  }
}

function logPayload(payload: any) {
  let message = '';
  if ('error' in payload) {
    const error = payload.error;
    message = error.message || error.name;
  }
  logger.error(message, payload);
}

export { errorMungerMiddleware, errorHandlerMiddleware };
