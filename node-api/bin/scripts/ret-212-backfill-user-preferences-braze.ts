import { Op } from 'sequelize';
import { chunk } from 'lodash';
import * as Bluebird from 'bluebird';

import { getPreferences } from '../../src/domain/user-notification';
import logger from '../../src/lib/logger';
import braze from '../../src/lib/braze';
import { User } from '../../src/models';

/**
 * 1) Snowflake query to produce CSV (user_id, marketing_sms_enabled)
 * 2) CSV to database
 * 3) Database to Braze
 *
 * === PART 3: Database to Braze ===
 * Query user batches and update Braze notifications attributes
 */

const args = process.argv;
const startingId = Number(args[2]);
const batchSize = Number(args[3]);
const batches = Number(args[4]);

const LOG_PREFIX = 'RET-212 DB to Braze';

async function main() {
  logger.info(`${LOG_PREFIX} script start`, { startingId, batchSize, batches });

  for (let i = 0; i < batches; i++) {
    logger.info(`${LOG_PREFIX} batch start`, { batch: i });

    const offset = startingId + i * batchSize;
    const batch = await getUserBatch(offset, offset + batchSize);

    const attributes = await Bluebird.map(batch, async ({ id }) => {
      const preferences = await getPreferences(id);
      return { externalId: String(id), ...preferences };
    });

    // https://www.braze.com/docs/api/basics/#api-limits
    const attributeChunks = chunk(attributes, 75);
    await Bluebird.each(attributeChunks, async attributeChunk => {
      const userIds = attributeChunk.map(c => c.externalId);
      try {
        await braze.track({ attributes: attributeChunk });
        logger.info(`${LOG_PREFIX} chunk complete`, { userIds });
      } catch (e) {
        logger.info(`${LOG_PREFIX} chunk error`, { userIds });
      }
    });

    logger.info(`${LOG_PREFIX} batch end`, { batch: i });
  }

  logger.info(`${LOG_PREFIX} script complete`, { startingId, batchSize, batches });
}

const getUserBatch = (start: number, end: number = 10000): PromiseLike<User[]> => {
  return User.findAll({
    where: {
      id: {
        [Op.gte]: start,
        [Op.lt]: end,
      },
    },
    order: [['id', 'ASC']],
  });
};

main()
  .then(() => process.exit())
  .catch(error => {
    logger.error(`${LOG_PREFIX} error`, error);
    process.exit(1);
  });
