import { ExternalTransactionProcessor } from '@dave-inc/wire-typings';
import * as config from 'config';
import { moment } from '@dave-inc/time-lib';
import { ConnectionConfig } from '../../typings';

export class Tabapay {
  get externalTransactionProcessor(): ExternalTransactionProcessor {
    return ExternalTransactionProcessor.Tabapay;
  }

  get sftpConfig(): ConnectionConfig {
    const tabapayConfig = {
      host: String(config.get('tabapay.sftp.host')),
      port: Number(config.get('tabapay.sftp.port')),
      username: String(config.get('tabapay.sftp.sftpUsername')),
      privateKey: String(config.get('tabapay.sftp.sshPrivateKey')),
      directory: String(config.get('tabapay.sftp.directory')),
    };
    return tabapayConfig;
  }

  public readonly saveToDatabase: boolean = true;

  public readonly saveToGcloud: boolean = true;

  public isFileTimeframeValid(fileName: string) {
    // Example: _20180127_
    const fileDate = moment(/_\d{8}_/.exec(fileName), 'YYYYMMDD');
    const validDateCutoff = moment('2019-10-08');
    return fileDate > validDateCutoff;
  }
}
