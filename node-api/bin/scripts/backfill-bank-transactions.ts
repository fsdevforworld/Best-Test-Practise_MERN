import { runTaskGracefully, processInBatches } from '../../src/lib/utils';
import { BankTransaction, BankAccount, BankConnection } from '../../src/models';
import { isNil, min } from 'lodash';
import { Op, WhereOptions } from 'sequelize';
import * as Bluebird from 'bluebird';
import { bankTransactionBackfillEvent } from '../../src/domain/event';
import { BankingDataSource } from '@dave-inc/wire-typings';
import { moment } from '@dave-inc/time-lib';
import { dogstatsd } from '../../src/lib/datadog-statsd';
import logger from '../../src/lib/logger';
import redisClient from '../../src/lib/redis';

const MIN_ID = isNil(process.env.END_ID) ? 0 : parseInt(process.env.END_ID, 10);
const JOB_ID = process.env.BACKFILL_JOB_ID ?? 'default';
const REDIS_KEY =
  JOB_ID !== 'default'
    ? `bank_transaction_backfill_max_id_${JOB_ID}`
    : 'bank_transaction_backfill_max_id';

async function getBatch(limit: number, offset: number, previous?: BankTransaction[] | null) {
  const where: WhereOptions = {};
  let maxId = null;
  if (previous?.length > 0) {
    maxId = min(previous.map(p => p.id));
  } else if (process.env.START_ID) {
    maxId = parseInt(process.env.START_ID, 10);
  } else if (await redisClient.getAsync(REDIS_KEY)) {
    maxId = parseInt(await redisClient.getAsync(REDIS_KEY), 10);
  }

  if (maxId) {
    where.id = {
      [Op.lt]: maxId,
      [Op.gte]: MIN_ID,
    };
  }

  logger.info(`Fetching next batch starting at id: ${maxId} and descending to ${MIN_ID}.`);
  const bankTransactions = BankTransaction.unscoped().findAll({
    where,
    limit,
    order: [['id', 'desc']],
    include: [
      {
        model: BankAccount,
        include: [{ model: BankConnection, paranoid: false }],
        paranoid: false,
      },
    ],
  });
  await redisClient.setAsync(REDIS_KEY, maxId);
  return bankTransactions;
}

async function processBatch(transactions: BankTransaction[]) {
  const concurrency = process.env.CONCURRENCY ? parseInt(process.env.CONCURRENCY, 10) : 1000;
  await Bluebird.map(
    transactions,
    async transaction => {
      await bankTransactionBackfillEvent.publish({
        source:
          transaction.bankAccount?.bankConnection?.bankingDataSource || BankingDataSource.Plaid,
        bankTransaction: {
          ...transaction.toJSON(),
          created: moment(transaction.created).format(),
          updated: moment(transaction.updated).format(),
        },
      });
      dogstatsd.increment('node_api.backfill_transactions.published', { jobName: JOB_ID ?? '' });
    },
    { concurrency },
  );
}

async function runTheThing() {
  await processInBatches(getBatch, processBatch);
}

runTaskGracefully(runTheThing);
