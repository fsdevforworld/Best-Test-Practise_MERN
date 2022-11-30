import {
  TabapayThruRisepayGateway,
  TabapayDirect,
  Chargebacks,
  Processor,
  Transactions,
} from '../domain/transaction-settlement-processing';
import { dogstatsd } from '../lib/datadog-statsd';
import { ITransactionSettlementParser } from '../domain/transaction-settlement-processing/interface';
import { Cron, DaveCron } from './cron';
import logger from '../lib/logger';

async function run() {
  dogstatsd.increment('transaction_settlements.ingestion_tasks_started');

  await processSettlementAndLog(new Chargebacks());
  await processSettlementAndLog(new TabapayThruRisepayGateway());
  await processSettlementAndLog(new TabapayDirect());
  await processSettlementAndLog(new Transactions());

  dogstatsd.increment('transaction_settlements.ingestion_tasks_finished');
}

async function processSettlementAndLog(parser: ITransactionSettlementParser) {
  dogstatsd.increment('transaction_settlements.ingestion_task_processing', {
    state: 'started',
    taskName: parser.settlementParserType,
  });
  let error;
  try {
    await new Processor(parser).process();
  } catch (ex) {
    logger.error('Error processing transaction ingestion', { ex });
    error = ex;
  } finally {
    dogstatsd.increment('transaction_settlements.ingestion_task_processing', {
      state: error ? 'error_thrown' : 'finished',
      taskName: parser.settlementParserType,
    });
  }
}

export const IngestTransactionSettlements: Cron = {
  name: DaveCron.IngestTransactionSettlements,
  process: run,
  schedule: '0 19 * * *',
};
