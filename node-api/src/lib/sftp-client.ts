import * as Sftp from 'ssh2-sftp-client';
import { ConnectionConfig } from '../typings';
import { omit } from 'lodash';

export default class SftpClient {
  public client: Sftp;
  public directory: string;
  private sftpConfig: ConnectionConfig;

  constructor(config: ConnectionConfig) {
    this.client = new Sftp();
    this.directory = config.directory;
    this.sftpConfig = omit(config, 'directory');
  }

  public async connect() {
    await this.client.connect({
      ...this.sftpConfig,
      algorithms: {
        serverHostKey: ['ssh-rsa', 'ssh-dss'],
      },
    });
  }
}
