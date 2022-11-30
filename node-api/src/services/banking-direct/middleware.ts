import { NextFunction, Request, Response } from 'express';
import { BankingDirectError, CUSTOM_ERROR_CODES } from '../../lib/error';
import BankingDirectUserSession from '../../models/banking-direct-user-session';
import User from '../../models/user';
import * as config from 'config';
import { IBankingDirectRequest } from '../../typings';

const PLAID_DIRECT_SECRET = config.get<string>('bankingDirect.plaidSecret');
const PLAID_CLIENT_ID = config.get<string>('bankingDirect.plaidClientId');

async function requireSecret(req: Request, res: Response, next: NextFunction) {
  const plaidSecret = req.get('X-PLAID-SECRET');
  const clientId = req.get('X-PLAID-CLIENT-ID');

  if (
    !plaidSecret ||
    plaidSecret !== PLAID_DIRECT_SECRET ||
    !clientId ||
    clientId !== PLAID_CLIENT_ID
  ) {
    return next(
      new BankingDirectError(
        'Mismatch of plaid credentials',
        401,
        CUSTOM_ERROR_CODES.BANKING_DIRECT_UNAUTHORIZED,
      ),
    );
  }

  return next();
}

async function requireDirectToken(req: IBankingDirectRequest, res: Response, next: NextFunction) {
  const authToken = req.get('X-PLAID-AUTH-TOKEN');
  const userId = req.get('X-PLAID-USER-ID');
  if (!authToken || !userId) {
    return next(
      new BankingDirectError(
        'Mismatch of plaid credentials',
        401,
        CUSTOM_ERROR_CODES.BANKING_DIRECT_UNAUTHORIZED,
      ),
    );
  }

  const session = await BankingDirectUserSession.findOne({
    include: [
      {
        model: User,
        required: true,
      },
    ],
    where: {
      token: authToken,
      userId,
    },
  });

  if (!session) {
    return next(
      new BankingDirectError(
        'Banking direct user session not found',
        401,
        CUSTOM_ERROR_CODES.BANKING_DIRECT_UNAUTHORIZED,
      ),
    );
  }

  req.user = session.user;

  return next();
}

export { requireSecret, requireDirectToken };
