import * as Bluebird from 'bluebird';
import { google } from 'googleapis';
import { isProdEnv } from './utils';
import * as config from 'config';

export class GcloudKms {
  public keyName: string;
  public authenticated: () => any;
  constructor() {
    this.keyName = config.get('kms.keyPath');

    /* istanbul ignore next */
    this.authenticated = async () =>
      new Bluebird((resolve, reject) => {
        google.auth.getApplicationDefault((err, authClient) => {
          if (err) {
            reject(
              'Failed to acquire credentials. Please run `gcloud auth application-default login`',
            );
          }

          // Instantiates an authorized client
          const kmsClient = google.cloudkms({
            version: 'v1',
            auth: authClient,
          });

          resolve(kmsClient);
        });
      });
  }

  /* istanbul ignore next */
  public async encrypt(plaintext: string, retry = 1000): Promise<{ ciphertext: string }> {
    if (!isProdEnv()) {
      return { ciphertext: plaintext };
    }
    const kmsClient = await this.authenticated();
    return new Promise<{ ciphertext: string }>((resolve, reject) => {
      kmsClient.projects.locations.keyRings.cryptoKeys.encrypt(
        {
          name: this.keyName,
          resource: {
            plaintext: Buffer.from(plaintext).toString('base64'),
          },
        },
        async (e: any, result: any) => {
          if (e) {
            // "Insufficient tokens for quota 'CryptoGroup' and limit 'CLIENT_PROJECT-100s' of service 'cloudkms.googleapis.com' for consumer 'project_number:294403164518'."
            if (e.code === 429 && retry <= 1024000) {
              // hard quota of 600 / minute
              await Bluebird.delay(retry);
              return resolve(this.encrypt(plaintext, retry * 2));
            }
            return reject(e);
          } else {
            return resolve({ ciphertext: result.data.ciphertext });
          }
        },
      );
    });
  }

  /* istanbul ignore next */
  public async decrypt(ciphertext: string, retry = 1000): Promise<string> {
    if (!isProdEnv()) {
      return ciphertext;
    }
    const kmsClient = await this.authenticated();
    return new Promise<string>((resolve, reject) => {
      kmsClient.projects.locations.keyRings.cryptoKeys.decrypt(
        { name: this.keyName, resource: { ciphertext } },
        (e: any, result: any) => {
          if (e) {
            // "Insufficient tokens for quota 'CryptoGroup' and limit 'CLIENT_PROJECT-100s' of service 'cloudkms.googleapis.com' for consumer 'project_number:294403164518'."
            if (e.code === 429 && retry <= 1024000) {
              // hard quota of 600 / minute
              return resolve(Bluebird.delay(retry, this.decrypt(ciphertext, retry * 2)));
            }
            return reject(e);
          } else {
            return resolve(Buffer.from(result.data.plaintext, 'base64').toString('utf8'));
          }
        },
      );
    });
  }
}

const kms = new GcloudKms();
export default kms;
