import ErrorHelper from '@dave-inc/error-helper';
import { partial } from 'lodash';
import { QueryTypes } from 'sequelize';
import logger from '../../lib/logger';
import { Moment } from '@dave-inc/time-lib';
import { sequelize } from '../../models';
import { AdvanceCollectionTrigger } from '../../typings';
import { UserEventCount } from './common';

// Different between payment and attempt:
// a failed payment attempt populates the
// extra field with the failure reason

const OneTimePaymentQuery = `
  SELECT user_id as userId, count as eventCount
  FROM (
    SELECT adv.user_id, COUNT(aca.id) AS count
    FROM advance_collection_attempt AS aca
    INNER JOIN advance AS adv
    ON aca.advance_id = adv.id
    WHERE aca.\`trigger\` = ?
      AND aca.created > ?
      AND aca.created <= ?
      AND aca.extra IS NULL
    GROUP BY adv.user_id
  ) as paymentCount
  WHERE count >= ?
`;

const OneTimePaymentAttemptQuery = `
  SELECT user_id as userId, count as eventCount
  FROM (
    SELECT adv.user_id, COUNT(aca.id) AS count
    FROM advance_collection_attempt AS aca
    INNER JOIN advance AS adv
    ON aca.advance_id = adv.id
    WHERE aca.\`trigger\` = ?
      AND aca.created > ?
      AND aca.created <= ?
    GROUP BY adv.user_id
  ) as paymentCount
  WHERE count >= ?
`;

async function countAdvanceCollectionTriggerUserEvent(
  query: string,
  maxEventCount: number,
  timeWindowDays: number,
  date: Moment,
): Promise<UserEventCount[]> {
  try {
    const results = await sequelize.query<UserEventCount>(query, {
      replacements: [
        AdvanceCollectionTrigger.USER_ONE_TIME_CARD,
        date
          .clone()
          .subtract(timeWindowDays, 'days')
          .format('YYYY-MM-DD'),
        date.format('YYYY-MM-DD'),
        maxEventCount,
      ],
      type: QueryTypes.SELECT,
    });
    return results;
  } catch (error) {
    const formatted = ErrorHelper.logFormat(error);
    logger.error('Error querying for advance collection trigger event', { ...formatted });
    throw error;
  }
}

export default {
  queryOneTimePaymentCount: partial(countAdvanceCollectionTriggerUserEvent, OneTimePaymentQuery),
  queryOneTimePaymentAttemptCount: partial(
    countAdvanceCollectionTriggerUserEvent,
    OneTimePaymentAttemptQuery,
  ),
};
