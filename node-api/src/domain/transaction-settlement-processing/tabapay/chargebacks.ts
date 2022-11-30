import * as Bluebird from 'bluebird';
import { FileInfo } from 'ssh2-sftp-client';
import { moment } from '@dave-inc/time-lib';
import { TransactionSettlementProcessedFile } from '../../../models';
import { TransactionSettlementStatus, TransactionSettlementType } from '@dave-inc/wire-typings';
import { ChargebackCSVRow, ParsedCSVRow } from '../../../typings';
import { ITransactionSettlementParser, SettlementParserType } from '../interface';
import { Tabapay } from '../tabapay';
import { metrics, TransactionSettlementProcesingMetrics as Metrics } from '../metrics';

export class Chargebacks extends Tabapay implements ITransactionSettlementParser {
  public readonly settlementParserType = SettlementParserType.Chargebacks;

  public filterFileNames(fileNames: FileInfo[]): Bluebird<FileInfo[]> {
    const chargebackFiles = fileNames.filter(file => file.name.includes('chargebacks'));
    const files = Bluebird.filter(chargebackFiles, async file => {
      const isChargebacksFile = file.name.includes('chargebacks');
      return (
        isChargebacksFile &&
        this.isChargebackFileTimeframeValid(file.name) &&
        (await TransactionSettlementProcessedFile.isFileUnprocessed(file.name))
      );
    });

    return files;
  }

  public convert(csvRow: ChargebackCSVRow): ParsedCSVRow {
    const statusMap: any = {
      'Documentation received': TransactionSettlementStatus.Representment,
      'Documentation Received': TransactionSettlementStatus.Representment,
      'Representment - merchant paid': TransactionSettlementStatus.Completed,
      'Representment - Merchant Paid': TransactionSettlementStatus.Completed,
      'Representment - 2nd - Merchant Paid': TransactionSettlementStatus.Completed,
      Open: TransactionSettlementStatus.Chargeback,
      'Open - Merchant debited': TransactionSettlementStatus.Chargeback,
      'Open - 2nd Chargeback - Merchant Debited': TransactionSettlementStatus.Chargeback,
      'Closed - 2nd Chargeback - Merchant Debited': TransactionSettlementStatus.Chargeback,
      'Closed - 3rd Chargeback - Merchant Debited': TransactionSettlementStatus.Chargeback,
      Closed: TransactionSettlementStatus.Chargeback,
    };

    const dateParsers = ['MM/DD/YYYY', 'M/D/YY'];

    return {
      externalId: csvRow['Merchant Reference ID'],
      status: statusMap[csvRow['Action-Status']],
      statusDate: moment(csvRow['Status Date'], dateParsers),
      chargebackDate: moment(csvRow['Exception Date'], dateParsers),
      originalDate: moment(csvRow['Original Creation Date'], dateParsers),
      amount: csvRow['Original Settled Amount'],
      settlementType: TransactionSettlementType.Payment,
      fullName: `${csvRow.Firstname} ${csvRow.Lastname}`,
      lastFour: csvRow['Last 4'],
    };
  }

  public markFileAsProcessed(): void {
    metrics.increment(Metrics.FILES_PROCESSED, ['fileType:chargebacks']);
  }

  private isChargebackFileTimeframeValid(fileName: string) {
    let isValid = false;

    const fileDate = moment(/_\d{8}_/.exec(fileName), 'YYYYMMDD');

    if (/^4002_\d{8}_chargebacks/.test(fileName)) {
      isValid = fileDate > moment('2019-10-22');
    } else if (/^1000_400001_\d{8}_chargebacks/.test(fileName)) {
      isValid = true;
    }

    return isValid;
  }
}
