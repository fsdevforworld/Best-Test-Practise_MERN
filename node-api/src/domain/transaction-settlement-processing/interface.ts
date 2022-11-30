import { FileInfo } from 'ssh2-sftp-client';
import { ParsedCSVRow, ConnectionConfig } from '../../typings';
import { ExternalTransactionProcessor } from '@dave-inc/wire-typings';

export enum SettlementParserType {
  Chargebacks = 'chargebacks',
  TabapayDirect = 'tabapay_direct',
  RisepayDirect = 'risepay_direct',
  TabapayThruRisepayGateway = 'tabapay_thru_risepay_gateway',
}

export interface ITransactionSettlementParser {
  readonly sftpConfig: ConnectionConfig;
  readonly externalTransactionProcessor: ExternalTransactionProcessor;
  readonly saveToDatabase: boolean;
  readonly saveToGcloud: boolean;
  readonly settlementParserType: SettlementParserType;
  filterFileNames(f: FileInfo[]): PromiseLike<FileInfo[]>;
  convert(r: any): ParsedCSVRow;
  markFileAsProcessed(): void;
}
