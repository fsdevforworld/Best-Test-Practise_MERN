import ErrorHelper from '@dave-inc/error-helper';
import { QueryTypes } from 'sequelize';
import * as Bluebird from 'bluebird';

import logger from '../lib/logger';
import { moment } from '@dave-inc/time-lib';
import { sequelize } from '../models';

import * as Notification from '../domain/notifications';

import { Cron, DaveCron } from './cron';

export function reconnect() {
  return Bluebird.all([
    sendAlert(1, 'DONT_GO_NEGATIVE'),
    sendAlert(2, 'ENSURE_SAFE_BALANCE'),
    sendAlert(5, 'KEEP_DAVE_STRONG'),
  ]);
}

export async function sendAlert(daysUntilPayback: number, messageId: string) {
  const users = await getDisconnectedUsers(daysUntilPayback);

  return Bluebird.map(
    users,
    async (user: DisconnectedUser) => {
      try {
        return await Notification.sendSMS(
          user.id,
          messageId,
          user.advanceId,
          'advance',
          messages[messageId](user),
        );
      } catch (error) {
        const formattedError = ErrorHelper.logFormat(error);
        logger.error('Error sending SMS to user', {
          userId: user.id,
          advance: user.advanceId,
          ...formattedError,
        });
      }
    },
    { concurrency: 40 },
  );
}

export const messages: { [key: string]: (user?: DisconnectedUser) => string } = {
  KEEP_DAVE_STRONG() {
    return 'Re-connect your bank account to make sure I can save you from overdraft. Keep Dave strong dave.com/m/reconnect';
  },

  ENSURE_SAFE_BALANCE(user: DisconnectedUser) {
    return `Hate to bother, but please re-connect to ensure your balance is safe for auto-collection on ${moment(
      user.paybackDate,
    ).format('dddd, MMMM Do')} dave.com/m/reconnect`;
  },

  DONT_GO_NEGATIVE() {
    return 'So you don’t go negative, I check your balance before I automatically recollect. But I lost connection and can’t guarantee safety. Reconnect your account for safe auto-collection dave.com/m/reconnect';
  },
};

export type DisconnectedUser = {
  id: number;
  phoneNumber: string;
  advanceId: number;
  paybackDate: string;
};

async function getDisconnectedUsers(daysFromNow: number): Promise<DisconnectedUser[]> {
  const query = `
    SELECT
      user.id,
      user.phone_number as phoneNumber,
      advance.id as advanceId,
      advance.payback_date as paybackDate
    FROM advance
    INNER JOIN bank_account ON bank_account.id = advance.bank_account_id
    INNER JOIN bank_connection ON bank_account.bank_connection_id = bank_connection.id
    INNER JOIN user on user.id = advance.user_id
    WHERE
      payback_date = ADDDATE(CURDATE(), ?) AND
      outstanding > 0 AND
      bank_connection.has_valid_credentials = false
  `;
  try {
    return await sequelize.query(query, { replacements: [daysFromNow], type: QueryTypes.SELECT });
  } catch (error) {
    logger.error('Error querying disconnected users', ErrorHelper.logFormat(error));
    throw error;
  }
}

export const Reconnect: Cron = {
  name: DaveCron.Reconnect,
  process: reconnect,
  schedule: '0 16 * * *',
};
