import admin from 'firebase-admin';
const { NODE_ENV } = process.env;
import * as uuidv4 from 'uuid/v4';
import * as config from 'config';
import { isObject } from 'lodash';
import { isTestEnv } from './utils';

const serviceAccountJson = config.get<string>('firebase.credentials');
if (!serviceAccountJson) {
  throw new Error('Please add FIREBASE_CREDENTIALS to your local env');
}
const serviceAccount = isObject(serviceAccountJson)
  ? serviceAccountJson
  : JSON.parse(serviceAccountJson);
const FIREBASE_DB_PREFIX = config.get('firebase.dbPrefix');
const FIREBASE_DB_BASE = config.get('firebase.dbBase');

let firebaseApp: admin.app.App;

export function initializeFirebase() {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: config.get('firebase.databaseUrl'),
  });

  firebaseApp = admin.initializeApp(
    {
      credential: admin.credential.cert(serviceAccount),
    },
    'dbApp',
  );
}

if (!isTestEnv()) {
  initializeFirebase();
}

async function send(token: string, title: string, body: string, ttl = 3600, priority = 'high') {
  const payload = {
    notification: {
      title,
      body,
    },
  };
  const options = {
    priority,
    timeToLive: ttl,
  };
  return admin.messaging().sendToDevice(token, payload, options);
}

function getDatabase(name?: string): admin.database.Database {
  const env = FIREBASE_DB_PREFIX || NODE_ENV;
  let urlBase = `https://${FIREBASE_DB_BASE}-${env}`;
  if (name) {
    urlBase += `-${name}`;
  }
  const databaseURL = `${urlBase}.firebaseio.com`;
  return firebaseApp.database(databaseURL);
}

async function getToken(): Promise<{ firebaseToken: string; uuid: string }> {
  const uuid = uuidv4();
  const additionalClaims = {
    databaseRoot: 'bankAccountId',
  };
  const firebaseToken = await firebaseApp
    .auth()
    .createCustomToken(uuid, additionalClaims)
    .then(t => t);
  return { uuid, firebaseToken };
}

export default {
  send,
  getDatabase,
  getToken,
};
