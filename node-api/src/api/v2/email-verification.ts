import { EmailVerificationResponse } from '@dave-inc/wire-typings';
import * as config from 'config';
import { Response } from 'express';

import { isEmpty } from 'lodash';
import { broadcastEmailUpdate } from '../../domain/user-updates';
import * as EmailVerificationHelper from '../../helper/email-verification';
import { checkIfEmailIsDuplicate } from '../../helper/user';

import {
  AlreadyExistsError,
  CUSTOM_ERROR_CODES,
  InvalidCredentialsError,
  InvalidParametersError,
  NotFoundError,
} from '../../lib/error';

import { wrapMetrics } from '../../lib/datadog-statsd';
import logger from '../../lib/logger';
import { RateLimiter } from '../../lib/rate-limiter';
import { formatPatch, getParams } from '../../lib/utils';
import { decode } from '../../lib/jwt';
import { EmailVerification, User, sequelize } from '../../models';
import {
  ConstraintMessageKey,
  InvalidParametersMessageKey,
  NotFoundMessageKey,
  RateLimitMessageKey,
} from '../../translations';
import { IDaveRequest, IDaveResponse } from '../../typings';

export enum Metric {
  tokenError = 'email_verification.token.error',
  tokenVerifyFailure = 'email_verification.token.verify_failure',
  tokenVerifySuccess = 'email_verification.token.verify_success',
  tokenUpdateFailure = 'email_verification.token.update_failure',
  tokenUpdateSuccess = 'email_verification.token.update_success',
}
export const metrics = wrapMetrics<Metric>();
const websiteURL = config.get('dave.website.url');

const rateLimiter = new RateLimiter('get-email_verification-check_duplicate', [
  { interval: 60, limit: 5 },
]);

async function checkDuplicate(req: IDaveRequest, res: Response): Promise<void> {
  await rateLimiter.incrementAndCheckLimit({
    key: req.get('X-Device-Id'),
    message: RateLimitMessageKey.TooManyRequests,
    stat: 'email-verification.check-duplicate.rate_limit',
  });
  const { email } = getParams(req.query, ['email']);
  await checkIfEmailIsDuplicate(email);
  res.status(200).send();
}

async function latest(
  req: IDaveRequest,
  res: IDaveResponse<EmailVerificationResponse>,
): Promise<void> {
  const { user } = req;
  const { id, email } = user;
  let latestVerification = await EmailVerification.latestForUser(user.id);

  if (!latestVerification && !email) {
    throw new InvalidParametersError(InvalidParametersMessageKey.UserNoEmailSet);
  } else if (!latestVerification) {
    latestVerification = await EmailVerification.create({ userId: id, email });
  }

  res.status(200).send(latestVerification);
}

async function verify(req: IDaveRequest, res: Response): Promise<void> {
  try {
    const { token } = req.params;
    let id;
    let email;

    try {
      ({ id, email } = decode(token));
    } catch (error) {
      logger.error(`[${Metric.tokenError}] Decoding Error: ${error.message}`, error);
      metrics.increment(Metric.tokenError);
      throw new InvalidCredentialsError(InvalidParametersMessageKey.VerificationCodeIsInvalid, {
        name: 'invalid_token',
        customCode: CUSTOM_ERROR_CODES.USER_INVALID_CREDENTIALS,
      });
    }

    const emailVerification = await EmailVerification.findByPk(id, {
      include: [
        {
          model: User,
          paranoid: true,
          required: true,
        },
      ],
    });

    if (!emailVerification) {
      throw new NotFoundError(NotFoundMessageKey.EmailVerificationNotFound);
    }

    const { user } = emailVerification;
    const previousEmail = user.email;

    if (isEmpty(emailVerification) || emailVerification.email !== email) {
      throw new InvalidParametersError('Invalid token');
    }

    if (emailVerification.verified) {
      return res.redirect(`${websiteURL}/email-verified`);
    }

    await checkIfEmailIsDuplicate(emailVerification.email, user.id);
    await sequelize.transaction(async transaction => {
      await user.update(
        {
          emailVerified: true,
          email: emailVerification.email,
        },
        { transaction },
      );
      await emailVerification.verify(transaction);
    });

    await broadcastEmailUpdate(user, previousEmail);

    logger.debug(
      `[${Metric.tokenVerifySuccess}] Verification ID: ${emailVerification.id} | User ID: ${user.id}`,
    );
    metrics.increment(Metric.tokenVerifySuccess);
  } catch (ex) {
    logger.error(`[${Metric.tokenVerifyFailure}] Error: ${ex.message}`, ex);
    metrics.increment(Metric.tokenVerifyFailure);
    throw ex;
  }

  return res.redirect(`${websiteURL}/email-verified`);
}

async function update(req: IDaveRequest, res: Response): Promise<void> {
  try {
    const updatedFields = formatPatch(req.body, ['email']);
    await checkIfEmailIsDuplicate(updatedFields.email, req.user.id);
    const emailVerification = await EmailVerification.findOne({
      where: { id: req.params.id, userId: req.user.id },
    });

    if (emailVerification.verified) {
      throw new AlreadyExistsError(ConstraintMessageKey.EmailAlreadyVerifiedNoMoreUpdates);
    }

    await EmailVerification.update(updatedFields, { where: { id: emailVerification.id } });
    await EmailVerificationHelper.sendEmail(
      req.user.id,
      emailVerification.id,
      updatedFields.email,
      req.user.email,
    );

    logger.debug(
      `[${Metric.tokenUpdateSuccess}] Verification ID: ${emailVerification.id} | User ID: ${req.user.id}`,
    );
    metrics.increment(Metric.tokenUpdateSuccess);
  } catch (ex) {
    logger.error(`[${Metric.tokenUpdateFailure}] Error: ${ex.message}`, ex);
    metrics.increment(Metric.tokenUpdateFailure);
    throw ex;
  }

  res.status(204).send();
}

export default {
  verify,
  latest,
  update,
  checkDuplicate,
};
