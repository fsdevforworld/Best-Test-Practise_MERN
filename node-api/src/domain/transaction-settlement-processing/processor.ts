import { ExternalTransactionProcessor, ExternalTransactionStatus } from '@dave-inc/wire-typings';
import * as Bluebird from 'bluebird';
import * as parse from 'csv-parse';
import { get, isEmpty } from 'lodash';
import { moment } from '@dave-inc/time-lib';
import { FileInfo } from 'ssh2-sftp-client';
import AdvanceHelper from '../../helper/advance';

import { PaymentUpdateTrigger, updatePayment } from '../../domain/payment';

import { saveCSVToGCloud } from '../../lib/gcloud-storage';
import SftpClient from '../../lib/sftp-client';
import { processCsv } from '../../lib/utils';
import {
  Advance,
  Payment,
  SubscriptionPayment,
  TransactionSettlement,
  TransactionSettlementProcessedFile,
} from '../../models';
import {
  TransactionSettlementStatus,
  ITransactionSettlementUpdateEventData,
} from '@dave-inc/wire-typings';

import {
  ChargebackCSVRow,
  ParsedCSVRow,
  TabapayTransactionCSVRow,
  TransactionSettlementSource,
} from '../../typings/external-transaction';
import { ITransactionSettlementParser, SettlementParserType } from './interface';
import { hasAdminCancelationOrCompletion } from './utils';
import { metrics, TransactionSettlementProcesingMetrics as Metrics } from './metrics';
import { Transform } from 'stream';
import logger from '../../lib/logger';
import { tabapayChargebackEvent, transactionSettlementUpdateEvent } from '../event';

const ROW_PROCESSING_BATCH_SIZE = 100;
const DAVE_BANKING_SUB_CLIENT_ID = '0005';

export class Processor {
  public static async saveFileAsProcessed(
    fileName: string,
    rowsProcessed: number,
    processTimeSeconds: number,
  ) {
    await TransactionSettlementProcessedFile.create({
      fileName,
      rowsProcessed,
      processTimeSeconds,
    });
  }

  private implementor: ITransactionSettlementParser;
  private sftp: SftpClient;
  private processorName: ExternalTransactionProcessor;

  constructor(implementor: ITransactionSettlementParser) {
    this.implementor = implementor;
    this.processorName = this.implementor.externalTransactionProcessor;
    this.sftp = new SftpClient(this.implementor.sftpConfig);
  }

  public async process(): Promise<void> {
    await this.sftp.connect();
    const files = await this.sftp.client.list(this.sftp.directory);
    const filteredFiles = await this.implementor.filterFileNames(files);
    const sortedFiles = filteredFiles.sort((file1, file2) => (file1.name < file2.name ? -1 : 1));
    await Bluebird.each(sortedFiles, async file => {
      // TODO: move this to its own job for idempotency
      try {
        await this.fileIterator(file);
      } catch (ex) {
        metrics.increment(Metrics.ERROR_ITERATING_FILE, {
          error: ex.name,
          processor: this.processorName,
          fileName: file.name,
          settlement_parser_type: this.implementor.settlementParserType,
        });
        logger.error('Error iterating file', { ex });
      }
    });
  }

  // public only for testing
  public async processData(csvRow: ChargebackCSVRow | TabapayTransactionCSVRow, file: FileInfo) {
    metrics.increment(Metrics.PROCESSING_ROW);
    const data = this.implementor.convert(csvRow);
    metrics.increment(Metrics.ROW_CONVERTED);

    if (!data.status) {
      // if we are not able to parse the status, it means we are doing some mapping wrong
      metrics.increment(Metrics.ERROR_PARSING_STATUS);
    }

    let transaction = await TransactionSettlement.findOne({
      where: { externalId: data.externalId, type: data.settlementType },
    });

    const matchingRecord = await this.findMatchingRecord(data.externalId);

    if (transaction) {
      // Prevent overwriting newer data (by re-running the job)
      // And only update when status is different from what is in db
      if (
        !this.isTransactionFileDataStale(transaction, file) &&
        transaction.status !== data.status
      ) {
        await Promise.all([
          this.updateTransactionSettlement(transaction, data, file.name),
          this.publishDaveBankingChargebackData(csvRow),
          this.publishTransactionSettlementUpdate(data, 'update'),
        ]);
      }
    } else {
      const result = await Promise.all([
        this.createTransactionSettlement(data, csvRow, matchingRecord),
        this.publishDaveBankingChargebackData(csvRow),
        this.publishTransactionSettlementUpdate(data, 'create'),
      ]);
      transaction = result[0];
    }

    // this only applies to chargebacks
    if (this.implementor.settlementParserType === SettlementParserType.Chargebacks) {
      if (
        // only update when statusDate is different from what is in db
        transaction.status === TransactionSettlementStatus.Representment &&
        data.statusDate &&
        !data.statusDate.isSame(transaction.representmentStart, 'day')
      ) {
        await transaction.update({ representmentStart: data.statusDate });
      } else if (
        // only update when statusDate is different from what is in db
        transaction.status === TransactionSettlementStatus.Completed &&
        data.statusDate &&
        !data.statusDate.isSame(transaction.representmentEnd, 'day')
      ) {
        await transaction.update({ representmentEnd: data.statusDate });
      }
    }

    if (!matchingRecord) {
      return;
    }

    // update advance network data even if the file is "stale"
    if (
      this.isAdvance(matchingRecord) &&
      this.hasCompletedAdvanceNetworkData(transaction.status, data)
    ) {
      await this.updateAdvanceNetwork(data, matchingRecord);
    }

    if (this.isTransactionFileDataStale(matchingRecord, file)) {
      return;
    }

    await this.updateTransactionStatus(matchingRecord, transaction);
  }

  public async updateAdvanceNetwork(data: ParsedCSVRow, advance: Advance): Promise<void> {
    const advanceUpdates: { networkId?: string; network?: string; approvalCode?: string } = {};
    try {
      if (data.networkId && advance.networkId !== data.networkId) {
        advanceUpdates.networkId = data.networkId;
      }

      if (data.network && advance.network !== data.network) {
        advanceUpdates.network = data.network;
      }

      if (data.approvalCode && advance.approvalCode !== data.approvalCode) {
        advanceUpdates.approvalCode = data.approvalCode;
      }

      if (!isEmpty(advanceUpdates)) {
        await advance.update(advanceUpdates);
        metrics.increment(Metrics.ADVANCE_NETWORK_UPDATED, {
          is_network_updated: `${Boolean(advanceUpdates.network)}`,
          is_approval_code_updated: `${Boolean(advanceUpdates.approvalCode)}`,
          is_network_id_updated: `${Boolean(advanceUpdates.networkId)}`,
        });
      }
    } catch (error) {
      logger.error(
        'Error while updating advance network data during transaction settlement processing',
        {
          error,
          fromAdvance: {
            id: advance.id,
            approvalCode: advance.approvalCode,
            network: advance.network,
            networkId: advance.networkId,
          },
          fromData: {
            approvalCode: data.approvalCode,
            network: data.network,
            networkId: data.networkId,
          },
          advanceUpdates,
        },
      );
      metrics.increment(Metrics.ERROR_UPDATING_ADVANCE_NETWORK);
    }
  }

  public isTransactionFileDataStale(
    transactionRecord: Payment | SubscriptionPayment | Advance | TransactionSettlement,
    file: FileInfo,
  ) {
    const fileDate = moment(/_\d{8}_/.exec(file.name), 'YYYYMMDD');
    const isChargebacksFile =
      this.implementor.settlementParserType === SettlementParserType.Chargebacks;

    const isStaleByFileDate = transactionRecord.updated > fileDate && !isChargebacksFile; // Allow the chargeback files to processor regardless (they are in order and should correct themselves)

    const isStale = isStaleByFileDate || hasAdminCancelationOrCompletion(transactionRecord);

    if (isStale) {
      metrics.increment(Metrics.SKIPPING_SETTLEMENT_ROW_STALE, {
        settlement_parser_type: this.implementor.settlementParserType,
        transactionRecordType:
          transactionRecord && transactionRecord.constructor
            ? transactionRecord.constructor.name
            : 'not implemented',
      });
    }
    return isStale;
  }

  private async findMatchingRecord(
    externalId: string,
  ): Promise<Payment | SubscriptionPayment | Advance> {
    const results = await Bluebird.all([
      Payment.findOne({
        where: {
          externalId,
          externalProcessor: this.processorName,
        },
      }),
      SubscriptionPayment.findOne({
        where: {
          externalId,
          externalProcessor: this.processorName,
        },
      }),
      Advance.findOne({
        where: {
          externalId,
          disbursementProcessor: this.processorName,
        },
      }),
    ]);

    return results.find(record => record !== null);
  }

  private async fileIterator(file: FileInfo): Promise<void> {
    logger.info(`Downloading ${file.name}`);
    metrics.increment(Metrics.DOWNLOADING_FILE, {
      processor: this.processorName,
      settlement_parser_type: this.implementor.settlementParserType,
    });

    if (this.implementor.saveToGcloud) {
      try {
        const gcloudStorageStream = saveCSVToGCloud(this.processorName, file.name);
        await this.sftp.client.get(
          `${this.sftp.directory}/${file.name}`,
          gcloudStorageStream as any,
        );
      } catch (ex) {
        // Never called
        logger.error('error piping to gcloud', { ex });
        metrics.increment(Metrics.ERROR_PIPING_TO_GCLOUND, {
          error: ex.name,
          processor: this.processorName,
        });
      }
    }

    if (this.implementor.saveToDatabase) {
      let rowsProcessed = 0;

      const transformStream = new Transform({
        transform: (data, _, done) => {
          done(null, data);
        },
      });
      const processRowFn = async (record: TabapayTransactionCSVRow | ChargebackCSVRow) => {
        try {
          await this.processData(record, file);
        } catch (ex) {
          metrics.increment(Metrics.ERROR_PROCESSING_ROW, {
            processor: this.processorName,
            settlement_parser_type: this.implementor.settlementParserType,
          });
          logger.error(`error processing row in ${file.name}`, { ex });
        } finally {
          rowsProcessed++;
        }
      };

      const parser = parse({
        skip_lines_with_error: true,
        from: 2,
        relax_column_count: true,
        columns: true,
        ltrim: true,
        rtrim: true,
      });

      // Allow bypassing bad rows (historically we have aborted the file when encountering one bad row)
      parser.on('skip', err => {
        metrics.increment(Metrics.ERROR_PARSING_ROW, {
          settlement_parser_type: this.implementor.settlementParserType,
        });
        logger.error(`error parsing row`, { err, fileName: file.name });
      });

      const start = moment();

      // NOTE: Don't await due to internal library waiting for 'finish' before returning
      const sftpPromise = this.sftp.client.get(
        `${this.sftp.directory}/${file.name}`,
        transformStream,
      );
      await processCsv(transformStream, processRowFn, {
        concurrencyLimit: ROW_PROCESSING_BATCH_SIZE,
        parser,
      });

      await sftpPromise;

      const processTimeSeconds = moment().diff(start, 'seconds');
      this.implementor.markFileAsProcessed();
      await Processor.saveFileAsProcessed(file.name, rowsProcessed, processTimeSeconds);
    }
  }

  private createTransactionSettlement(
    data: ParsedCSVRow,
    raw: TabapayTransactionCSVRow | ChargebackCSVRow,
    matchingRecord?: Payment | SubscriptionPayment | Advance,
  ) {
    const { status, originalDate, externalId, amount, settlementType, fullName, lastFour } = data;
    const modelName = get(matchingRecord, 'constructor.name', null); //handling for case of undefined matchingRecord

    // @ts-ignore
    const sourceType = TransactionSettlementSource[modelName] || null;
    const sourceId = get(matchingRecord, 'id', null);
    const processor = this.processorName;

    const transaction = TransactionSettlement.build({
      externalId,
      type: settlementType,
      status,
      amount,
      processed: originalDate,
      sourceId,
      sourceType,
      processor,
      fullName,
      lastFour,
      raw,
    });

    metrics.increment(Metrics.CREATED, {
      type: settlementType,
      processor,
      sourceType,
      settlement_parser_type: this.implementor.settlementParserType,
    });
    return transaction.save();
  }

  private updateTransactionSettlement(
    transaction: TransactionSettlement,
    data: ParsedCSVRow,
    fileName: string,
  ) {
    metrics.increment(Metrics.UPDATED, {
      processor: this.processorName,
      settlement_parser_type: this.implementor.settlementParserType,
    });

    return transaction.update({ status: data.status }, { metadata: { fileName } });
  }

  private async updateTransactionStatus(
    matchingRecord: Payment | SubscriptionPayment | Advance,
    transaction: TransactionSettlement,
  ) {
    if (!matchingRecord) {
      return;
    }

    const status = this.normalizeSettlementStatus(transaction.status);

    metrics.increment(Metrics.PAYMENT_UPDATED, {
      processor: this.processorName,
      settlement_parser_type: this.implementor.settlementParserType,
      updated_model: get(matchingRecord, 'constructor.name', 'Not implemented'),
    });

    if (this.isPayment(matchingRecord)) {
      await updatePayment(
        matchingRecord,
        { status },
        false,
        PaymentUpdateTrigger.TransactionSettlementImportJob,
      );
    } else if (this.isSubscriptionPayment(matchingRecord)) {
      await matchingRecord.update({ status });
    } else if (this.isAdvance(matchingRecord)) {
      await AdvanceHelper.updateDisbursementStatus(matchingRecord, status);
    }
  }

  private normalizeSettlementStatus(status: TransactionSettlementStatus) {
    switch (status) {
      case TransactionSettlementStatus.Completed:
        return ExternalTransactionStatus.Completed;
      case TransactionSettlementStatus.Chargeback:
        return ExternalTransactionStatus.Chargeback;
      case TransactionSettlementStatus.Canceled:
      case TransactionSettlementStatus.Error:
        return ExternalTransactionStatus.Canceled;
      case TransactionSettlementStatus.Pending:
      case TransactionSettlementStatus.Representment:
      default:
        return ExternalTransactionStatus.Pending;
    }
  }

  private isPayment(record: any): record is Payment {
    return record.constructor === Payment;
  }

  private isSubscriptionPayment(record: any): record is SubscriptionPayment {
    return record.constructor === SubscriptionPayment;
  }

  private isAdvance(record: any): record is Advance {
    return record.constructor === Advance;
  }

  private hasCompletedAdvanceNetworkData(
    transactionStatus: TransactionSettlementStatus,
    data: ParsedCSVRow,
  ) {
    return Boolean(
      (data.approvalCode || data.network || data.networkId) &&
        this.normalizeSettlementStatus(transactionStatus) === ExternalTransactionStatus.Completed,
    );
  }

  private async publishDaveBankingChargebackData(csvRow: Record<string, unknown>) {
    try {
      if (csvRow && this.implementor.settlementParserType === SettlementParserType.Chargebacks) {
        const chargebackRow = csvRow as ChargebackCSVRow;
        // only send dave banking row now
        if (csvRow.MID === DAVE_BANKING_SUB_CLIENT_ID) {
          tabapayChargebackEvent.publish({
            merchantReferenceId: chargebackRow['Merchant Reference ID'],
            originalTransactionId: chargebackRow['Original Transaction ID'],
            actionStatus: chargebackRow['Action-Status'],
            statusDate: chargebackRow['Status Date'],
            exceptionDate: chargebackRow['Exception Date'],
            exceptionType: chargebackRow['Exception Type'],
            originalCreationDate: chargebackRow['Original Creation Date'],
            originalProcessedDate: chargebackRow['Original Processed Date'],
            originalSettledAmount: chargebackRow['Original Settled Amount'],
            firstName: chargebackRow.Firstname,
            lastName: chargebackRow.Lastname,
            last4: chargebackRow['Last 4'],
            subClientId: chargebackRow.MID,
          });
          metrics.increment(Metrics.ROW_DATA_PUBLISHED, {
            processor: this.processorName,
            settlement_parser_type: this.implementor.settlementParserType,
          });
        }
      }
    } catch (error) {
      logger.error('Error publish tabapay chargeback data', { error });
      metrics.increment(Metrics.ERROR_ROW_DATA_PUBLISHED, {
        processor: this.processorName,
        settlement_parser_type: this.implementor.settlementParserType,
      });
    }
  }

  private async publishTransactionSettlementUpdate(
    csvRow: ParsedCSVRow,
    operation: 'create' | 'update',
  ) {
    try {
      transactionSettlementUpdateEvent.publish({
        externalId: csvRow.externalId,
        status: csvRow.status,
        settlementType: csvRow.settlementType,
        originalDate: csvRow.originalDate.valueOf(),
        amount: csvRow.amount,
        fullName: csvRow.fullName,
        lastFour: csvRow.lastFour,
        approvalCode: csvRow.approvalCode,
        network: csvRow.network,
        networkId: csvRow.networkId,
        operation,
      } as ITransactionSettlementUpdateEventData);
      metrics.increment(Metrics.UPDATE_PUBLISHED, {
        processor: this.processorName,
        settlement_parser_type: this.implementor.settlementParserType,
      });
    } catch (error) {
      logger.error('Error publish transaction settlement update', { error });
      metrics.increment(Metrics.ERROR_UPDATE_PUBLISHED, {
        processor: this.processorName,
        settlement_parser_type: this.implementor.settlementParserType,
      });
    }
  }
}
