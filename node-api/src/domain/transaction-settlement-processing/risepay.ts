import { ExternalTransactionProcessor } from '@dave-inc/wire-typings';
import * as config from 'config';
import { ConnectionConfig } from '../../typings';

export class Risepay {
  get externalTransactionProcessor(): ExternalTransactionProcessor {
    return ExternalTransactionProcessor.Risepay;
  }

  get sftpConfig(): ConnectionConfig {
    const risepayConfig = {
      host: String(config.get('risepay.sftp.host')),
      port: Number(config.get('risepay.sftp.port')),
      username: String(config.get('risepay.sftp.sftpUsername')),
      directory: String(config.get('risepay.sftp.directory')),
    };
    return risepayConfig;
  }

  public readonly saveToDatabase: boolean = false;

  public readonly saveToGcloud: boolean = true;
}
