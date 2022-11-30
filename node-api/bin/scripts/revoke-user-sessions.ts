import { QueryTypes } from 'sequelize';
import { sequelize } from '../../src/models';
import logger from '../../src/lib/logger';
import '../../src/models';

async function main(userIdStart: number, userIdEnd: number, limit: number) {
  const query = `
    UPDATE user_session
    INNER JOIN (
      SELECT user.id as user_id, COUNT(DISTINCT password_history.id) as count
      FROM user
      INNER JOIN user_session ON
        user_session.user_id = user.id AND
        user_session.revoked IS NULL
      LEFT JOIN password_history ON
        password_history.user_id = user.id
      WHERE
        user.id BETWEEN :userIdStart AND :userIdEnd
      GROUP BY user_id
      HAVING count < 2
      LIMIT :limit
    ) t ON t.user_id = user_session.user_id
    SET revoked = NOW();
  `;

  let rowsAffected = 0;

  do {
    const result = await sequelize.query(query, {
      replacements: { userIdStart, userIdEnd, limit },
      type: QueryTypes.UPDATE,
    });

    rowsAffected = result[1];
  } while (rowsAffected >= limit);
}

const [start, end, queryLimit] = Array.from(process.argv).slice(2);

main(parseInt(start, 10), parseInt(end, 10), parseInt(queryLimit, 10))
  .then(() => process.exit())
  .catch(error => {
    logger.error(error);
    process.exit(1);
  });
