import * as Bluebird from 'bluebird';
import * as fs from 'fs';
import * as DbMigrate from 'db-migrate';
import * as config from 'config';
import { Sequelize } from 'sequelize';
import { initializeRedisClient } from '../src/lib/redis';
import { initializeSequelize } from '../src/models';

const TEST_DB_NAME = 'dave_dev';

initializeSequelize();

before(async function() {
  initializeRedisClient();

  this.timeout(120000);
  if (process.argv.includes('skip-migrations')) {
    return Promise.resolve();
  }

  if (process.env.DB_NAME !== TEST_DB_NAME) {
    throw new Error('Database is not dave_test aborting for safety.');
  }

  const db = new Sequelize({
    username: config.get<string>('db.user'),
    password: config.get<string>('db.password'),
    dialect: 'mysql',
    logging: false,
    host: config.get<string>('db.host'),
    port: parseInt(config.get('db.port'), 10),
  });

  const sql = fs.readFileSync('./migrations/seeds/schema.sql').toString();
  const queries = sql
    .replace(/\/\*.*\*\//g, '')
    .split(';')
    .map(q => q.trim())
    .filter(q => q.length > 0);
  await Bluebird.each(queries, query => db.query(query));

  const env = process.env.NODE_ENV;

  const dbMigrate = DbMigrate.getInstance(false, {
    env,
    // I have tried importing this from the actual config and it did not work perhaps someone
    // smarter than me can figure this out, i took the easy way out.
    config: {
      test: {
        database: 'dave_dev',
        host: { ENV: 'DB_HOST' },
        port: { ENV: 'DB_PORT' },
        driver: 'mysql',
        user: 'dev',
        password: 'password123',
      },
      ci: {
        host: 'localhost',
        driver: 'mysql',
        user: 'dev',
        password: 'password123',
        database: { ENV: 'DB_NAME' },
      },
    },
  });
  dbMigrate.internals.argv._ = [];
  await db.close();

  await dbMigrate.up();
});
