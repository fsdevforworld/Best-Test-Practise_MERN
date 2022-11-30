import { Risepay } from '../risepay';
import { ITransactionSettlementParser, SettlementParserType } from '../interface';
import * as Bluebird from 'bluebird';
import { FileInfo } from 'ssh2-sftp-client';
import { TabapayTransactionCSVRow, ParsedCSVRow } from '../../../typings/external-transaction';
import { TransactionSettlementProcessedFile } from '../../../models';
import { metrics, TransactionSettlementProcesingMetrics as Metrics } from '../metrics';

export class Transactions extends Risepay implements ITransactionSettlementParser {
  public readonly settlementParserType = SettlementParserType.RisepayDirect;

  public filterFileNames(fileNames: FileInfo[]): Bluebird<FileInfo[]> {
    const files = Bluebird.filter(fileNames, async file => {
      const isTransactionFile = /DaveDailyTransactions/.test(file.name);
      return (
        isTransactionFile && (await TransactionSettlementProcessedFile.isFileUnprocessed(file.name))
      );
    });
    return files;
  }

  public convert(csvRow: TabapayTransactionCSVRow): ParsedCSVRow {
    // This is a no-op because
    // For risepay sftp files we don't want to save them to the database
    // we just want to save them to gcloud
    return;
  }

  public markFileAsProcessed(): void {
    metrics.increment(Metrics.FILES_PROCESSED, ['fileType:transactions', 'processor:Risepay']);
  }
}
