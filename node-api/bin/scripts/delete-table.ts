import { sequelize } from '../../src/models';
import { QueryTypes } from 'sequelize';
import logger from '../../src/lib/logger';

const DELETE_LIMIT = 10000;

/**
 * YOU MUST ADD THE migration-db-credentials secret to the script-runner.yml file in
 * order for this to work.
 */
async function main() {
  const tableName = process.argv[2];
  if (!tableName) {
    throw new Error('Script must include the table name as the only command line argument');
  }

  let totalDeleted = 0;
  let deleted = 0;
  do {
    deleted = await sequelize.query(`DELETE FROM ${tableName} LIMIT ${DELETE_LIMIT}`, {
      type: QueryTypes.BULKDELETE,
    });
    totalDeleted += deleted;
    logger.info(`DELETED ${totalDeleted} rows so far.`);
  } while (deleted === DELETE_LIMIT);
  logger.info('Done deleting rows. Dropping table...');
  await sequelize.query(`DROP TABLE ${tableName}`);
  logger.info('Finished!');
}

main()
  .then(() => process.exit())
  .catch(err => {
    logger.error('Delete error', err);
    process.exit(1);
  });
