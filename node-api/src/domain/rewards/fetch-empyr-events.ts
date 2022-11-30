import * as Bluebird from 'bluebird';
import { EmpyrEvent, sequelize } from '../../models';
import fetchRewards from './fetch-rewards';

/**
 * Get all reward transactions for a user,
 * with the most recent `event_type` sent by Empyr through our webhook.
 *
 * To filter older transactions,
 * we get the most recent record of those with the same `transaction_id`
 *
 * We also want to filter out the following `event_types`:
 *  - `REMOVED_DUP` events, which are duplicated `CLEARED` transactions that don't give any money (commision + reward amount).
 *  - `AUTHORIZed` with `reward_amount` = 0, meaning they are a "Non-Qualified Redemption".
 **/
export default async function fetchEmpyrEvents(userId: number) {
  const query = `
    SELECT *
    FROM empyr_event
    JOIN
    (
      SELECT
        transaction_id,
        max(id) AS max_id
      FROM empyr_event
      WHERE user_id = ?
        AND (reward_amount > 0 OR event_type = 'REMOVED')
      GROUP BY transaction_id
    ) most_recent
    ON
      empyr_event.id = most_recent.max_id
    ORDER BY transaction_date DESC
`;

  const empyrEventsPromise: Bluebird<EmpyrEvent[]> = sequelize.query(query, {
    replacements: [userId],
    model: sequelize.models.EmpyrEvent,
    mapToModel: true,
  });

  const [rewardTransactions, userReward] = await Promise.all([
    empyrEventsPromise,
    fetchRewards(userId),
  ]);

  const rewardTransactionContracts = rewardTransactions.map(evt => evt.serialize());

  return {
    rewardTransactions: rewardTransactionContracts,
    userReward,
  };
}
