import * as Bluebird from 'bluebird';
import { FileInfo } from 'ssh2-sftp-client';
import { moment } from '@dave-inc/time-lib';
import { TransactionSettlementProcessedFile } from '../../../models';
import { TransactionSettlementStatus, TransactionSettlementType } from '@dave-inc/wire-typings';
import { ParsedCSVRow, TabapayTransactionCSVRow } from '../../../typings/external-transaction';
import { ITransactionSettlementParser, SettlementParserType } from '../interface';
import { Tabapay } from '../tabapay';
import { metrics, TransactionSettlementProcesingMetrics as Metrics } from '../metrics';

export class TabapayDirect extends Tabapay implements ITransactionSettlementParser {
  public readonly settlementParserType = SettlementParserType.TabapayDirect;

  // store a set of the already downloaded files in redis
  public filterFileNames(fileNames: FileInfo[]): Bluebird<FileInfo[]> {
    const files = Bluebird.filter(fileNames, async file => {
      return (
        this.isDirectTransactionFile(file.name) &&
        this.isFileTimeframeValid(file.name) &&
        (await TransactionSettlementProcessedFile.isFileUnprocessed(file.name))
      );
    });
    return files;
  }

  public convert(csvRow: TabapayTransactionCSVRow): ParsedCSVRow {
    const typeMap: any = {
      Purchase: TransactionSettlementType.Payment,
      Disbursement: TransactionSettlementType.Disbursement,
    };

    const dateParser = 'MM/DD/YYYY HH:mm:ss';

    return {
      externalId: csvRow['Transaction ID'],
      status: this.mapStatus(csvRow.Status),
      settlementType: typeMap[csvRow.Type],
      originalDate: moment(csvRow['Processed Date'], dateParser),
      amount: csvRow['Transaction Amount'],
      fullName: `${csvRow['First Name']} ${csvRow['Last Name']}`,
      lastFour: csvRow['Last 4'],
      approvalCode: csvRow['Approval Code'],
      network: csvRow['Settlement Network'],
      networkId: csvRow['Network ID'],
    };
  }

  public markFileAsProcessed(): void {
    metrics.increment(Metrics.FILES_PROCESSED, [
      'fileType:transactions',
      'gateway:tabapay',
      'processor:tabapay',
    ]);
  }

  private isDirectTransactionFile(fileName: string) {
    // Example:   4002_20191021_transactions_v2-5.csv
    return /^4002_\d{8}_transactions_v\d+-\d+.csv/.test(fileName);
  }

  private mapStatus(status: string) {
    switch (status) {
      case 'Error':
      case 'Unknown-Failed':
        return TransactionSettlementStatus.Canceled;
      case 'Complete':
      case 'Unknown-Posted':
        return TransactionSettlementStatus.Completed;
      default:
        return TransactionSettlementStatus.Pending;
    }
  }
}
