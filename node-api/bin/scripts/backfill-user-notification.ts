import { Op } from 'sequelize';

import logger from '../../src/lib/logger';
import { User } from '../../src/models';
import { UserNotification } from '../../src/models';

const LOG_PREFIX = 'user notification backfill';

const args = process.argv;
const notificationId = Number(args[2]);
const startId = Number(args[3]);
const endId = Number(args[4]);
const batchSize = Number(args[5]) || 10000;

const info = { notificationId, startId, endId, batchSize };

async function main() {
  checkInput(notificationId, 'notificationId');
  checkInput(startId, 'startId');
  checkInput(endId, 'endId');

  logger.info(`${LOG_PREFIX} script start`, info);
  const batches = Math.ceil((endId - startId) / batchSize);
  for (let i = 0; i < batches; i++) {
    const batchStart = startId + i * batchSize;
    const batchEnd = batchStart + batchSize < endId ? batchStart + batchSize : endId;
    logger.info(`${LOG_PREFIX} batch start`, { ...info, batchStart, batchEnd });
    try {
      const users = await getUserBatch(batchStart, batchEnd);
      const updates = users.map(u => ({ userId: u.id, notificationId }));
      await UserNotification.bulkCreate(updates, { ignoreDuplicates: true });
    } catch (error) {
      logger.error(`${LOG_PREFIX} error processing`, { batchStart, batchEnd });
      throw error;
    }
    logger.info(`${LOG_PREFIX} batch end`, { ...info, batchStart, batchEnd });
  }
  logger.info(`${LOG_PREFIX} script complete`, info);
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

function checkInput(value: any, name: string) {
  if (typeof value === undefined) {
    throw Error(`missing ${name}`);
  }
}

main()
  .then(() => process.exit())
  .catch(error => {
    logger.error(`${LOG_PREFIX} error`, error);
    process.exit(1);
  });
