import { Request } from 'express';
import { BankAccount } from '../../../models';

import { NotFoundError } from '../../../lib/error';
import logger from '../../../lib/logger';

import { StandardResponse } from '@dave-inc/wire-typings';
import { IDaveResponse } from '../../../typings';

import { runBalanceRefreshWithLock } from './controller';

const BANK_REFRESH_INTERNAL_SERVER_ERROR_REASON = 'Bank refresh source threw internal server error';
const BANK_REFRESH_INTERNAL_SERVER_ERROR_MESSAGE = 'an unexpected error occurred';

const BANK_REFRESH_INST_NOT_RESP_MESSAGE =
  'this institution is not currently responding to this request.';
const BANK_REFRESH_INST_NOT_RESP_REASON = 'Institution not responding';

const BANK_DATA_SOURCE_REFRESH_ERROR_NAME = 'BankDataSourceRefreshError';

export async function refreshBalanceForBankAccount(
  req: Request,
  res: IDaveResponse<StandardResponse>,
) {
  const { advanceId } = req.params;
  const bankAccount = await BankAccount.findByPk(req.params.id);

  const { useCache = true } = req.body;

  logger.info('Starting aether balance refresh', {
    useCache,
    advanceId,
    bankAccountId: bankAccount.id,
  });

  if (!advanceId) {
    throw new NotFoundError();
  }

  try {
    const { completed, result: balances } = await runBalanceRefreshWithLock(
      advanceId,
      bankAccount,
      { useCache },
    );

    // even if we hit the rate limit, send the cached balances, but with a warning
    const serializedResponse = { ok: completed, balances };

    return res.send(serializedResponse);
  } catch (ex) {
    logger.error('Error refreshing balance', {
      advanceId,
      bankAccountId: bankAccount.id,
      errorName: ex.name,
      errorMessage: ex.message,
    });

    if (ex.message.includes(BANK_REFRESH_INST_NOT_RESP_MESSAGE)) {
      return res.status(502).send({ ok: false, reason: BANK_REFRESH_INST_NOT_RESP_REASON });
    }

    if (
      ex.name === BANK_DATA_SOURCE_REFRESH_ERROR_NAME &&
      ex.message === BANK_REFRESH_INTERNAL_SERVER_ERROR_MESSAGE
    ) {
      return res.status(500).send({ ok: false, reason: BANK_REFRESH_INTERNAL_SERVER_ERROR_REASON });
    }

    return res.status(500).send({ ok: false });
  }
}
