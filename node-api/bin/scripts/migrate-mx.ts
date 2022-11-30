import { BankingDataSource } from '@dave-inc/wire-typings';
import logger from '../../src/lib/logger';
import { Advance, BankConnection, User } from '../../src/models';
import * as Bluebird from 'bluebird';
import { Op } from 'sequelize';
import { isNil, groupBy, map, values } from 'lodash';
import { deleteMxUser } from '../../src/helper/user';

const limit = isNil(process.env.BATCH_SIZE) ? 100 : parseInt(process.env.BATCH_SIZE, 10);
const concurrency = isNil(process.env.CONCURRENCY) ? 5 : parseInt(process.env.CONCURRENCY, 10);
const isDryRun = process.env.DRYRUN !== 'false';

async function processConnection(connections: BankConnection[]) {
  const userId = connections[0].userId;
  const bankConnectionIds = map(connections, c => c.id);

  try {
    const advance = await Advance.findOne({ where: { userId, outstanding: { [Op.gt]: 0 } } });
    const user = await User.findByPk(userId);

    if (isNil(user)) {
      logger.error('Failed to load user', { userId });
    }

    if (!isNil(advance)) {
      logger.info(`User ${userId} has an outstanding advance: ${advance.id}`);
      return;
    }
    logger.info(`Resetting bank connection(s) for user ${userId}`, { bankConnectionIds });

    if (!isDryRun) {
      const result = await BankConnection.update(
        { hasValidCredentials: false },
        { where: { id: bankConnectionIds } },
      );
      logger.info(`Updated database for user ${userId}`, { result });

      await deleteMxUser(user);
      logger.info(`Deleted MX data for user ${userId}`);
    }
  } catch (error) {
    logger.error(`Failed migration for user ${userId}`, { bankConnectionIds, error });
  }
}
async function main() {
  logger.info('Starting migration script', { isDryRun, limit, concurrency });
  const bankConnections = await BankConnection.findAll({
    attributes: ['id', 'userId'],
    where: { bankingDataSource: BankingDataSource.Mx, hasValidCredentials: true },
    limit,
  });

  logger.info(`Found ${bankConnections.length} row(s)`);
  const bankConnectionsByUser = groupBy(bankConnections, c => c.userId.toString());
  await Bluebird.map(values(bankConnectionsByUser), processConnection, { concurrency });
}

main()
  .then(() => process.exit())
  .catch(error => {
    logger.error('Failed', { error });
    process.exit(1);
  });
