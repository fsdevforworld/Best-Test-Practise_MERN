import * as https from 'https';
import * as zlib from 'zlib';
import { google } from 'googleapis';
import * as config from 'config';
import { isObject } from 'lodash';

const serviceAccountJson = config.get<string>('firebase.credentials');
if (!serviceAccountJson) {
  throw new Error('Please add REMOTE_CONFIG_CREDENTIALS to your local env');
}
const serviceAccount = isObject(serviceAccountJson)
  ? serviceAccountJson
  : JSON.parse(serviceAccountJson);
const REMOTE_CONFIG_HOST = config.get<string>('firebase.remoteConfig.host');
const REMOTE_CONFIG_PATH = config.get<string>('firebase.remoteConfig.path');
const REMOTE_CONFIG_SCOPES = config.get<string>('firebase.remoteConfig.scopes');

/**
 * Get a valid access token.
 */
function getAccessToken() {
  return new Promise((resolve, reject) => {
    const jwtClient = new google.auth.JWT(
      serviceAccount.client_email,
      null,
      serviceAccount.private_key,
      REMOTE_CONFIG_SCOPES,
      null,
    );
    jwtClient.authorize((err: any, tokens: any) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(tokens.access_token);
    });
  });
}

/**
 * Retrieve the current Firebase Remote Config template from the server. Once
 * retrieved the template is stored locally in a file named `current-remote-config-template.json`.
 */
async function getTemplate(): Promise<string[]> {
  return new Promise<string[]>((resolve, reject) => {
    getAccessToken().then(accessToken => {
      const options = {
        hostname: REMOTE_CONFIG_HOST,
        path: REMOTE_CONFIG_PATH,
        headers: {
          Authorization: 'Bearer ' + accessToken,
          'Accept-Encoding': 'gzip',
        },
      };

      const buffer: any[] = [];
      const request = https.request(options, (resp: any) => {
        if (resp.statusCode === 200) {
          const gunzip = zlib.createGunzip();
          resp.pipe(gunzip);

          gunzip
            .on('data', (data: any) => {
              buffer.push(data.toString());
            })
            .on('end', () => {
              const currentEtag = resp.headers.etag;
              resolve([buffer.join(''), currentEtag]);
            })
            .on('error', (err: any) => {
              reject(err);
            });
        } else {
          reject(resp.error);
        }
      });

      request.on('error', (err: any) => {
        reject(err);
      });

      request.end();
    });
  });
}

/**
 * Publish the local template stored in `filename` to the server.
 */
function publishTemplate(etag: string, file: string) {
  getAccessToken().then(accessToken => {
    const options = {
      hostname: REMOTE_CONFIG_HOST,
      path: REMOTE_CONFIG_PATH,
      method: 'PUT',
      headers: {
        Authorization: 'Bearer ' + accessToken,
        'Content-Type': 'application/json; UTF-8',
        'Accept-Encoding': 'gzip',
        'If-Match': etag,
      },
    };

    const request = https.request(options);

    request.on('error', (err: any) => {
      throw new Error('Failed to publish remote config template');
    });

    request.write(file);
    request.end();
  });
}

export default {
  getTemplate,
  publishTemplate,
};
