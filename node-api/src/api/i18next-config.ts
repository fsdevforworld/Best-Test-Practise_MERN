import * as path from 'path';
import * as express from 'express';

import * as i18next from 'i18next';
import i18nextMiddleware from 'i18next-express-middleware';
// tslint:disable-next-line:no-require-imports
import FSBackend = require('i18next-node-fs-backend');

import { isProdEnv, isStagingEnv } from '../lib/utils';

export function configureI18NextMiddleware(app: express.Express) {
  // const baseDetector = new i18nextMiddleware.LanguageDetector();

  const loadPath =
    isProdEnv() || isStagingEnv()
      ? '/opt/app/src/translations/{{lng}}/{{ns}}.json'
      : path.join(__dirname, '../translations/{{lng}}/{{ns}}.json');

  const addPath =
    isProdEnv() || isStagingEnv()
      ? '/opt/app/src/translations/{{lng}}/{{ns}}.missing.json'
      : path.join(__dirname, '../translations/{{lng}}/{{ns}}.missing.json');

  i18next
    //@ts-ignore
    .use(i18nextMiddleware.LanguageDetector)
    .use(FSBackend)
    .init({
      backend: {
        loadPath,
        addPath,
      },
      ns: 'error',
      defaultNS: ['error'],
      fallbackLng: 'en',
      preload: ['en', 'es'],
      saveMissing: true,
      missingKeyHandler: (_lng: string, _ns: string, key: string, _fallback: string) => key,
      parseMissingKeyHandler: (key: string) => key,
    });

  //@ts-ignore
  app.use(i18nextMiddleware.handle(i18next));
}
