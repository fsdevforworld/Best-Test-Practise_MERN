import { PlaidErrorCode } from '../../typings';
import { Message } from '@google-cloud/pubsub';
import { BankingDataSourceError } from '../../domain/banking-data-source/error';
import { dogstatsd } from '../../lib/datadog-statsd';
import logger from '../../lib/logger';

export function handleBankConnectionUpdaterError(
  err: BankingDataSourceError | Error,
  itemId: string,
  event: Message,
) {
  if (err instanceof BankingDataSourceError) {
    switch (err.errorCode) {
      case PlaidErrorCode.InvalidAccessToken:
        event.ack();
        return;

      case PlaidErrorCode.InternalServerError:
        dogstatsd.increment('plaid_updater.handle_error.internal_server_error');
        logger.error('internal_server_error', { itemId, err });
        event.nack();
        return;

      case PlaidErrorCode.DuplicateAccountsFound:
      default:
        logger.error('duplicate_account', { itemId, err });
        event.ack();
        return;
    }
  } else {
    logger.error('Bank connection updater error', { itemId, err });
    event.ack();
  }
}
