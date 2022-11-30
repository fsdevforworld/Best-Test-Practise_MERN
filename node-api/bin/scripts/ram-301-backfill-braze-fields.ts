import * as Bluebird from 'bluebird';
import { QueryTypes } from 'sequelize';
import { chunk, maxBy } from 'lodash';
import { runTaskGracefully, processInBatches } from '../../src/lib/utils';
import braze from '../../src/lib/braze';
import { User, sequelize } from '../../src/models';
import logger from '../../src/lib/logger';

const { STARTING_ID = '0', BATCH_SIZE = '50000', CONCURRENCY = '1000' } = process.env;
const concurrency = parseInt(CONCURRENCY, 10);
let numberOfProcessedBatches = 0;
let numberOfProcessedUsers = 0;

const getBatch = (
  limit: number,
  _offset: number,
  previous: Array<Partial<User>>,
): Promise<Array<Partial<User>>> => {
  const highestProcessedId = previous?.length
    ? previous[previous.length - 1].id
    : parseInt(STARTING_ID, 10);

  return sequelize.query(
    `
      SELECT id, email
      FROM user
      WHERE id > ? and deleted = '9999-12-31 23:59:59'
      ORDER BY id ASC
      LIMIT ?
    `,
    { type: QueryTypes.SELECT, replacements: [highestProcessedId, limit] },
  );
};

async function processBatch(users: Array<Partial<User>>) {
  logger.info(
    `updateBrazeUsers: Fetched ${users.length} users to update in batch ${numberOfProcessedBatches +
      1}`,
  );
  const chunkedUsers = chunk(users, 75);
  await Bluebird.map(
    chunkedUsers,
    async chunkedUserGroup => {
      try {
        const userWithHighestId = maxBy(chunkedUserGroup, 'id');
        const attributes = chunkedUserGroup.map(user => ({
          externalId: user.id.toString(),
          email_verified: Boolean(user.email),
          is_lockedout: false,
          fake_custom_field: true,
        }));

        await braze.track({ attributes });
        logger.info(`updateBrazeUsers: updated braze users with up to id: ${userWithHighestId.id}`);
      } catch (e) {
        logger.error('updateBrazeUsers: error updating user from braze', {
          error: e.message,
        });
      }
    },
    { concurrency },
  );

  numberOfProcessedUsers += users.length;

  logger.info(
    `updateBrazeUsers: Processed a total number of ${++numberOfProcessedBatches} batches and updated ${numberOfProcessedUsers} braze users`,
  );
}

async function updateBrazeUsers() {
  await processInBatches(getBatch, processBatch, parseInt(BATCH_SIZE, 10));
}

runTaskGracefully(updateBrazeUsers);
