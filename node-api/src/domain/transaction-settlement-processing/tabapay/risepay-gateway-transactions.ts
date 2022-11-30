import * as Bluebird from 'bluebird';
import { FileInfo } from 'ssh2-sftp-client';
import { moment } from '@dave-inc/time-lib';
import { TransactionSettlementProcessedFile } from '../../../models';
import { TransactionSettlementStatus, TransactionSettlementType } from '@dave-inc/wire-typings';
import { ParsedCSVRow, TabapayTransactionCSVRow } from '../../../typings/external-transaction';
import { ITransactionSettlementParser, SettlementParserType } from '../interface';
import { Tabapay } from '../tabapay';
import { metrics, TransactionSettlementProcesingMetrics as Metrics } from '../metrics';

export class TabapayThruRisepayGateway extends Tabapay implements ITransactionSettlementParser {
  public readonly settlementParserType = SettlementParserType.TabapayThruRisepayGateway;

  public filterFileNames(fileNames: FileInfo[]): Bluebird<FileInfo[]> {
    const files = Bluebird.filter(fileNames, async file => {
      return (
        this.isRisepayTransactionFile(file.name) &&
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
      externalId: csvRow['Reference ID'],
      status: this.mapStatus(csvRow.Status),
      settlementType: typeMap[csvRow.Type],
      originalDate: moment(csvRow['Processed Date'], dateParser),
      amount: csvRow['Transaction Amount'],
      fullName: `${csvRow['First Name']} ${csvRow['Last Name']}`,
      lastFour: csvRow['Last 4'],
    };
  }

  public markFileAsProcessed(): void {
    metrics.increment(Metrics.FILES_PROCESSED, [
      'fileType:transactions',
      'gateway:risepay',
      'processor:tabapay',
    ]);
  }

  private isRisepayTransactionFile(fileName: string) {
    // Example:  1000_400001_20190710_transactions_v2-4.csv
    return /^1000_400001_\d{8}_transactions_v\d+-\d+.csv/.test(fileName);
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
