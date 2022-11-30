import * as Notification from '../domain/notifications';
import { sequelize } from '../models';
import { QueryTypes } from 'sequelize';
import { Cron, DaveCron } from './cron';

type AdvanceQueryResult = {
  email: string;
  firstName: string;
  userId: number;
  id: number;
  hasValidCredentials: boolean;
};

export async function unableToCollectAlert(): Promise<any> {
  const query = `
    SELECT
      user.email,
      user.first_name as firstName,
      advance.user_id as userId,
      advance.id,
      bank_connection.has_valid_credentials as hasValidCredentials
    FROM advance
    INNER JOIN bank_account on bank_account.id = advance.bank_account_id
    INNER JOIN bank_connection on bank_connection.id = bank_account.bank_connection_id
    INNER JOIN user on user.id = advance.user_id
    LEFT JOIN alert on
      alert.user_id = user.id AND
      alert.type = 'EMAIL' AND
      alert.subtype = 'UNABLE_TO_COLLECT' AND
      alert.event_uuid = advance.id
    WHERE
      advance.outstanding > 0 AND
      advance.payback_date = CURDATE() AND
      alert.id is null
  `;

  return sequelize.query(query, { type: QueryTypes.SELECT }).map((advance: AdvanceQueryResult) => {
    if (advance.hasValidCredentials === false) {
      return Notification.sendUnableToCollect(
        advance.id,
        advance.userId,
        advance.email,
        advance.firstName,
      );
    }
  });
}

export const UnableToCollectAlert: Cron = {
  name: DaveCron.UnableToCollectAlert,
  process: unableToCollectAlert,
  schedule: '0 17 * * *',
};
