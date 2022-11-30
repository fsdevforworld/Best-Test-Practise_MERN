import * as Accounting from 'accounting';
import * as Bluebird from 'bluebird';
import * as changeCase from 'change-case';
import * as crypto from 'crypto';
import * as parse from 'csv-parse';
import * as PhoneNumber from 'google-libphonenumber';
import { isEmpty, isEqual, pick, some, uniq, without, isNaN } from 'lodash';
import * as moment from 'moment';
import { Moment } from 'moment';
import * as semver from 'semver';
import { Model, Transaction } from 'sequelize';
import { Readable } from 'stream';
import * as request from 'superagent';
import { InvalidParametersError } from './error';
import { dogstatsd, wrapMetrics } from '../lib/datadog-statsd';
import { BankAccountBalances, IDaveRequest } from '../typings';
import * as config from 'config';
import { lookup } from '@dave-inc/zipcode-to-timezone';
import {
  DebugAgentConfig,
  StackdriverConfig,
} from '@google-cloud/debug-agent/build/src/agent/config';
import { Debuglet, IsReady } from '@google-cloud/debug-agent/build/src/agent/debuglet';
import logger from './logger';
import { DEFAULT_TIMEZONE } from '@dave-inc/time-lib';

const phoneUtil = PhoneNumber.PhoneNumberUtil.getInstance();
const PNF = PhoneNumber.PhoneNumberFormat;
export const MFA_LENGTH = 6;
export const LEGACY_MFA_LENGTH = 4;
const MFA_REGEX = new RegExp(`^[0-9]{${MFA_LENGTH}}$`);
const LEGACY_MFA_REGEX = new RegExp(`^[0-9]{${LEGACY_MFA_LENGTH}}$`);

export enum MFACodeValidation {
  ValidMFA,
  InvalidLegacyMFA,
  InvalidMFA,
}

function shallowMungeObjToCase(obj: any, toCase: string, exclude: string[] = []): any {
  const changeFn = toCase === 'camelCase' ? changeCase.camelCase : changeCase.snakeCase;
  if (obj) {
    return Object.keys(obj).reduce((acc, key) => {
      if (!exclude.includes(key)) {
        acc[changeFn(key, null, true)] = obj[key];
      } else {
        acc[key] = obj[key];
      }
      return acc;
    }, {} as any);
  }

  return obj;
}

function getCardScheme(number: string) {
  if (/^3[47]/.test(number)) {
    return 'amex';
  } else if (/^(6011|65|64[4-9]|622)/.test(number)) {
    return 'discover';
  } else if (/^5[0-5]/.test(number)) {
    return 'mastercard';
  } else if (/^4/.test(number)) {
    return 'visa';
  } else {
    return 'other';
  }
}

function generateRandomHexString(length: number): string {
  return crypto
    .randomBytes(Math.ceil(length / 2))
    .toString('hex')
    .substr(0, length);
}

/**
 * Pure function.
 */
function moveArrayItemToIndex<T>(array: T[], from: number, to: number): T[] {
  const clone = array.slice();
  const item = clone.splice(from, 1)[0];
  clone.splice(to, 0, item);
  return clone;
}

function toE164(phoneNumber: string) {
  try {
    return phoneUtil.format(phoneUtil.parse(phoneNumber.toString(), 'US'), PNF.E164);
  } catch (err) {
    throw new InvalidParametersError(err.message);
  }
}

function toNonE164Format(phoneNumber: string) {
  return phoneNumber.replace(/^\+1/, '');
}

function validateE164(phoneNumber: string) {
  try {
    return (
      phoneUtil.parse(phoneNumber, 'US') &&
      phoneNumber === phoneUtil.format(phoneUtil.parse(phoneNumber, 'US'), PNF.E164)
    );
  } catch (error) {
    return false;
  }
}

const validPhoneNumberRegex = /^(\+1)?\d{10}$/;

function validatePhoneNumber(phoneNumber: string): boolean {
  return Boolean(phoneNumber?.match(validPhoneNumberRegex));
}

function validateLastFourSSNFormat(lastFourSSN: string): boolean {
  return Boolean(lastFourSSN?.match(/^\d{4}$/));
}

function formatCurrency(value: number, decimals = 0) {
  return Accounting.formatMoney(value, '$', decimals);
}

function obfuscateEmail(email: string) {
  return email.replace(/([\w\W]).*([\w\W])@/, '$1****$2@');
}

function getParams(provided: any, required: string[], optional: string[] = []): any {
  return required.reduce(
    (acc, param) => {
      if (provided[param] === undefined) {
        throw new InvalidParametersError(null, {
          required,
          provided,
        });
      }
      acc[param] = provided[param];
      return acc;
    },
    optional.reduce((acc, param) => {
      if (provided[param] !== undefined) {
        acc[param] = provided[param];
      }
      return acc;
    }, {} as any),
  );
}

function titleCase(str: string) {
  //https://stackoverflow.com/questions/196972/convert-string-to-title-case-with-javascript#196991
  return str.replace(/\w\S*/g, txt => {
    return txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase();
  });
}

function formatPatch(fields: any, updatableFields: any) {
  const invalidFields = without(Object.keys(fields), ...updatableFields);
  const updatedFields = pick(fields, updatableFields);

  if (invalidFields.length > 0) {
    throw new InvalidParametersError(`Field(s) not allowed: ${invalidFields.join(',')}`);
  }

  if (isEmpty(updatedFields)) {
    throw new InvalidParametersError(
      `Must include one or more of the following fields: ${updatableFields.join(',')}`,
    );
  }

  return updatedFields;
}

function deepTrim(obj: any) {
  if (typeof obj === 'string') {
    return obj.trim();
  } else if (typeof obj === 'object') {
    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        obj[key] = deepTrim(obj[key]);
      }
    }
  }
  return obj;
}

function validateAccountNumber(input: number | string) {
  if (!input) {
    return false;
  }
  const account = input.toString();
  if (!account.match(/^\d+$/)) {
    return false;
  }
  return account.length >= 5 && account.length <= 17;
}

/*
 * https://github.com/DrShaffopolis/bank-routing-number-validator/blob/master/index.js
 */
function validateRoutingNumber(input: number | string) {
  if (!input) {
    return false;
  }

  let routing = input.toString();
  if (!routing.match(/^\d+$/) || routing.length > 9) {
    return false;
  }
  routing = '0'.repeat(9 - routing.length) + routing;

  //The first two digits of the nine digit RTN must be in the ranges 00 through 12, 21 through 32, 61 through 72, or 80.
  //https://en.wikipedia.org/wiki/Routing_transit_number
  const firstTwo = parseInt(routing.substring(0, 2), 10);
  const firstTwoValid =
    (0 <= firstTwo && firstTwo <= 12) ||
    (21 <= firstTwo && firstTwo <= 32) ||
    (61 <= firstTwo && firstTwo <= 72) ||
    firstTwo === 80;
  if (!firstTwoValid) {
    return false;
  }

  //this is the checksum
  //http://www.siccolo.com/Articles/SQLScripts/how-to-create-sql-to-calculate-routing-check-digit.html
  const weights = [3, 7, 1];
  let sum = 0;
  for (let i = 0; i < 8; i++) {
    sum += parseInt(routing[i], 10) * weights[i % 3];
  }

  return (10 - (sum % 10)) % 10 === parseInt(routing[8], 10);
}

/*
 * This function compares account routing sandwich and if they aren't equal then does an routing
 * number compare. If that matches it then remove all the 0's from the front of account number and
 * compares for equality.
 * We had to do this because the account numner for the same bank account is different what we get
 * from Plaid vs what the user enters during microdeposit validation.
 * Eg. plaid gives us account numner as 0000322112 but the user might enter it as 322112
 */
export function compareAccountRouting(
  decryptedAccountRouting1: string,
  decryptedAccountRouting2: string,
): boolean {
  if (decryptedAccountRouting1 === decryptedAccountRouting2) {
    return true;
  }
  const [account1, routing1] = decryptedAccountRouting1.split('|');
  const [account2, routing2] = decryptedAccountRouting2.split('|');
  if (routing1 === routing2) {
    const fullAccount1 = account1.replace(/^0+/, '');
    const fullAccount2 = account2.replace(/^0+/, '');
    return fullAccount1 === fullAccount2;
  }
  return false;
}

/**
 * Generates a random number with between min and max
 * The maximum is *exclusive* and the minimum is *inclusive*
 *
 * Stolen shamelessly from
 * https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Math/random
 *
 * *If someone changes this function, ask why.*
 *
 * @param {Number} min - min number to generate - a ceiling value
 * @param {Number} max - max number - a floor value
 * @returns {Number} random number
 */
function getRandomInt(min: number, max: number): number {
  min = Math.ceil(min);
  max = Math.floor(max);
  return crypto.randomInt(min, max);
}

/**
 * Generates a random numbers with n digits
 *
 * *If someone changes this function, ask why.*
 *
 * @param {Number} digits - (optional) n digits to generate
 * @returns {string} n random digits
 */
function generateRandomNumber(digits: number): number {
  const min = 10 ** (digits - 1);
  const max = 10 ** digits - 1;
  const randomIntInRange = getRandomInt(min, max);
  return randomIntInRange;
}

/**
 * Generates a random string containing numbers with n digits
 * Note this function might return numbers left padded with zeros
 * such as 000001.
 *
 * *If someone changes this function, ask why.*
 *
 * @param {Number} digits - n digits to generate
 * @returns {string} n random digits
 */
function generateRandomNumberString(digits: number): string {
  const min = 0;
  const max = 10 ** digits;
  const randomInt = getRandomInt(min, max).toString();
  const padded = randomInt.padStart(digits, '0');
  return padded;
}

/**
 *
 * *If someone changes this function, ask why.*
 *
 * @returns {string} MFA_LENGTH random digits
 */
function generateMFACode(): string {
  return generateRandomNumberString(MFA_LENGTH);
}

export function validateZipCode(zipCode: string): boolean {
  return /^\d{5}(-\d{4})?$/.test(zipCode);
}

function validateEmail(email: string): boolean {
  const re = /^(([^<>()\[\]\\.,;:\s@"]+(\.[^<>()\[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;
  return re.test(String(email).toLowerCase());
}

function isLegacyMFACode(code: string): boolean {
  return Boolean(code.match(LEGACY_MFA_REGEX));
}

function isValidMFAFormat(code: string): boolean {
  return Boolean(code.match(MFA_REGEX));
}

/*
 * Note: It's important that we check if this is a legacy code first to prompt the user what to do.
 */
function validateMFACode(code: string): MFACodeValidation {
  if (isLegacyMFACode(code)) {
    return MFACodeValidation.InvalidLegacyMFA;
  } else if (!isValidMFAFormat(code)) {
    return MFACodeValidation.InvalidMFA;
  } else {
    return MFACodeValidation.ValidMFA;
  }
}

function getAvailableOrCurrentBalance(balances: BankAccountBalances) {
  const { available, current } = balances;

  return available === null ? current : available;
}

export enum Metric {
  zipCodeNotFound = 'zipcode_to_timezone.zip_code_not_found',
}
export const metrics = wrapMetrics<Metric>();

function getTimezoneFromZipCode(zipCode: string): string {
  const timezone = lookup(zipCode);
  if (!timezone && zipCode) {
    metrics.increment(Metric.zipCodeNotFound);
    logger.warn('Zip code not found in zipcode-to-timezone lib', { zipCode });
  }
  return timezone || DEFAULT_TIMEZONE;
}

export function isDevEnv(): boolean {
  return process.env.NODE_ENV === 'dev';
}

export function isTestEnv(): boolean {
  return process.env.NODE_ENV === 'test' || process.env.NODE_ENV === 'ci';
}

export function isProdEnv(): boolean {
  return process.env.NODE_ENV === 'production';
}

export function isStagingEnv(): boolean {
  return process.env.NODE_ENV === 'staging';
}

export function minVersionCheckFromRequest(req: IDaveRequest, version: string): boolean {
  const appVersion = req.get('X-App-Version');
  const deviceType = req.get('X-Device-Type');

  return minVersionCheck({ appVersion, deviceType }, version);
}

export function minVersionCheck(
  { appVersion, deviceType }: { appVersion: string; deviceType: string },
  version: string,
): boolean {
  const isWebApp = ['admin_web', 'web'].includes(deviceType);

  // web app always meets min version requirement
  if (isWebApp) {
    return true;
  }

  return semver.valid(appVersion) && semver.gte(appVersion, version);
}

async function retry<T>(
  promiseCreator: () => Promise<T>,
  retries: number = 4,
  timeout: number = isTestEnv() ? 10 : 1000,
): Promise<T> {
  try {
    const result = await promiseCreator();
    return result;
  } catch (err) {
    if (retries > 0) {
      await Bluebird.delay(timeout);
      return retry(promiseCreator, retries - 1, timeout * 2);
    } else {
      throw err;
    }
  }
}

/**
 * Helper method will continue executing a given promise as long as the provided criteria allows for it
 * Includes options to add a delay after every attempt, and an overall timeout
 *
 * @param {() => PromiseLike<T>} promiseCreator
 * @param {(response: T) => boolean} shouldKeepPolling
 * @param {() => void} onSuccessfulPoll
 * @param {number} delayMs
 * @param {number} timeoutMs
 * @returns {Promise<T>}
 */
export async function poll<T>(
  promiseCreator: () => PromiseLike<T>,
  {
    shouldKeepPolling,
    onSuccessfulPoll = async () => {},
    delayMs,
    timeoutMs,
  }: {
    shouldKeepPolling: (response: T) => boolean;
    onSuccessfulPoll?: (response: T) => Promise<void>;
    delayMs: number;
    timeoutMs: number;
  },
): Promise<T> {
  const timeoutPromise = Bluebird.resolve(sleep(timeoutMs));

  return Promise.race([
    (async () => {
      await timeoutPromise;

      throw new Bluebird.TimeoutError(`Timed out polling after ${timeoutMs}ms`);
    })(),
    (async () => {
      let response: T;

      do {
        response = await promiseCreator();

        onSuccessfulPoll(response);

        if (!shouldKeepPolling(response)) {
          return response;
        }

        await sleep(delayMs);
      } while (!timeoutPromise.isResolved());
    })(),
  ]);
}

function urlSafeBase64Encode(buffer: Buffer) {
  return buffer
    .toString('base64')
    .replace(/\+/g, '-') // Convert '+' to '-'
    .replace(/\//g, '_') // Convert '/' to '_'
    .replace(/=+$/, ''); // Remove ending '='
}

function urlSafeBase64Decode(base64: string) {
  // Add removed at end '='
  base64 += Array(5 - (base64.length % 4)).join('=');

  base64 = base64
    .replace(/\-/g, '+') // Convert '-' to '+'
    .replace(/\_/g, '/'); // Convert '_' to '/'

  return Buffer.from(base64, 'base64');
}

/**
 * Create human-readable string of array elements
 */
function formatArrayToString(arr: string[]): string {
  let outStr = '';
  if (arr.length === 1) {
    outStr = arr[0];
  } else if (arr.length === 2) {
    //joins all with "and" but no commas
    //example: "bob and sam"
    outStr = arr.join(' and ');
  } else if (arr.length > 2) {
    //joins all with commas, but last one gets ", and" (oxford comma!)
    //example: "bob, joe, and sam"
    outStr = arr.slice(0, -1).join(', ') + ', and ' + arr.slice(-1);
  }
  return outStr;
}

export async function concurrentForEach<T>(
  iterable: Iterable<T>,
  concurrency: number,
  fn: (item: T) => any,
) {
  const inFlight = new Set();

  for (const item of iterable) {
    const promise = Promise.resolve(fn(item));

    inFlight.add(promise);

    promise.then(() => inFlight.delete(promise));

    if (inFlight.size >= concurrency) {
      await Promise.race(inFlight);
    }
  }

  await Promise.all(inFlight);
}

/**
 * Function for processing a large group of objects in batches.
 * @param getBatch     A function which takes in a limit and offset and returns the batch to process
 * @param processBatch A function which processes the batch
 * @param batchSize    A configurable batch size.
 */
export async function processInBatches<T>(
  getBatch: (limit: number, offset: number, previous?: T[] | null) => T[] | PromiseLike<T[]>,
  processBatch: (results: T[], offset: number) => any | PromiseLike<any>,
  batchSize: number = 10000,
): Promise<number> {
  let offset = 0;
  let items: T[] = null;
  while (offset % batchSize === 0) {
    items = await getBatch(batchSize, offset, items);
    if (items.length === 0) {
      break;
    }
    offset += items.length;
    await processBatch(items, offset);
  }

  return offset;
}

/**
 * Returns true the moment the first promise resolves to the desired value.
 *
 * Will still bubble up any promise rejections that arise.
 */
export function anyResolveTo<T>(
  promises: Array<Promise<T>>,
  isDesiredValue: (value: T) => Promise<boolean> | boolean,
): Promise<boolean> {
  return new Promise(async resolve => {
    await Promise.all(
      promises.map(async promise => {
        const value = await promise;

        const isMatch = await Promise.resolve(isDesiredValue(value));
        if (isMatch) {
          resolve(true);
        }
      }),
    );
    resolve(false);
  });
}

/**
 * Removes any sequences that contains digits
 * Intended to scrub check/account/payerID/payeeID strings and other uuids in a transaction name
 * e.g.
 * DEPOSIT WL DIGITAL CH#12345 VIA PAYPAL => DEPOSIT WL DIGITAL VIA PAYPAL
 * COMENITY PAY VI DES:WEB PYMT ID:P17217578389875 INDN:JAMIE L. WHITMER CO ID:XXXXX63498 WEB => COMENITY PAY VI DES:WEB PYMT INDN:JAMIE L. WHITMER CO WEB
 */
function scrubTransactionName(name: string) {
  if (!name) {
    return name;
  }
  const numericScrubbed = name
    .split(' ')
    .filter(term => !some(term, char => !isNaN(parseInt(char, 10))));
  const result = uniq(numericScrubbed)
    .filter((term: string) => term.toUpperCase() !== 'ON')
    .join(' ');

  if (result === '') {
    return name;
  }
  return result;
}

const sleep = async (milliseconds: number) => {
  return Bluebird.delay(milliseconds);
};

const sleepSeconds = async (seconds: number) => {
  return Bluebird.delay(seconds * 1000);
};

const exitGracefully = async (seconds: number) => {
  return sleep(seconds * 1000).then(() => {
    dogstatsd.socket.close(() => {
      process.exit();
    });
  });
};

const runTaskGracefully = async (
  runFn: () => Promise<any>,
  gracefulTimeoutSeconds: number = 90,
) => {
  try {
    await runFn();
  } catch (ex) {
    logger.error('Error running task gracefully', { ex });
    process.exitCode = 1;
  } finally {
    await exitGracefully(gracefulTimeoutSeconds);
  }
};

const runTaskGracefullyWithMetrics = async (
  runFn: () => Promise<any>,
  taskName: string,
  gracefulTimeoutSeconds?: number,
): Promise<any> => {
  const wrappedRunFn = async () => {
    const datadogMetric = 'task_execution';
    const log = (status: string, extra?: { [key: string]: any }) => {
      logger.info('Logging in run gracefully', { type: datadogMetric, taskName, status, ...extra });
      dogstatsd.increment(datadogMetric, { taskName, status });
    };

    let start: Moment;
    let isError;

    try {
      start = moment();
      log('started');

      await runFn();
    } catch (ex) {
      // NOTE: Errors should be rare events and we should fix them asap. They should 'vary' little.
      dogstatsd.increment(`${datadogMetric}.crashing_error`, {
        taskName,
        error_name: ex.name,
      });

      isError = true;
      throw ex;
    } finally {
      const status = isError ? 'errored' : 'finished';
      const durationSeconds = moment().diff(start, 'seconds');
      log(status, { durationSeconds });
    }
  };
  return runTaskGracefully(wrappedRunFn, gracefulTimeoutSeconds);
};

function getMemoryUsageInMb() {
  return process.memoryUsage().heapUsed / 1024 / 1024;
}

async function processCsv<TRow = string[], TExtraData = any>(
  csvFileStream: Readable,
  tryProcessRowFn: (row: TRow, extraData?: TExtraData) => Promise<boolean | void>,
  options: {
    concurrencyLimit?: number;
    shouldOutputRowStatsToConsole?: boolean;
    extraData?: TExtraData;
    parser?: parse.Parser;
  } = {
    concurrencyLimit: 25,
    shouldOutputRowStatsToConsole: true,
  },
) {
  const counters = { rowsProcessedCount: 0, errorCount: 0 };

  const inProgress = new Set();

  async function processData() {
    // Get first
    let row = this.read();

    while (row) {
      if (inProgress.size >= options.concurrencyLimit) {
        await Promise.race(inProgress);
      }
      const work = Promise.resolve(
        (async () => {
          const isSuccess = await tryProcessRowFn(row, options.extraData);

          if (options.shouldOutputRowStatsToConsole) {
            counters.rowsProcessedCount += 1;
            if (!isSuccess) {
              counters.errorCount += 1;
            }
          }
        })(),
      );

      inProgress.add(work);
      work.then(() => inProgress.delete(work));

      // Get next
      row = this.read();
    }

    await Promise.all(inProgress);

    if (options.shouldOutputRowStatsToConsole) {
      logger.info(
        `CSV processing in progress. ${counters.rowsProcessedCount} rows processed with ${
          counters.errorCount
        } errors. [${Math.round(getMemoryUsageInMb() * 100) / 100} MB of memory]`,
      );
    }
  }

  await new Promise(async (resolve, reject) => {
    const parser = options.parser ? options.parser : parse({ delimiter: ',' });

    parser.on('readable', processData);
    parser.on('error', err => {
      logger.error('aborting processCsv', { err });
      reject();
    });
    parser.on('end', async () => {
      await Promise.all(inProgress);

      if (options.shouldOutputRowStatsToConsole) {
        logger.info(
          `CSV finished processing. ${counters.rowsProcessedCount} rows processed with ${counters.errorCount} errors.`,
        );
      }
      resolve();
    });

    csvFileStream.pipe(parser);
  });

  return counters;
}

/**
 * Downloads a base 64 encoded image string from a given url
 *
 * @param {string} url
 * @returns {string}
 */
async function downloadImageAndBase64Encode(url: string): Promise<string> {
  const { body }: { body: Buffer } = await request
    .get(url)
    .buffer(true)
    .parse(request.parse.image);

  if (!(body instanceof Buffer)) {
    throw new Error(`Image unable to be downloaded from url ${url}`);
  }

  return body.toString('base64');
}

function nonEssentialPromiseHandler(promise: Promise<any>, label: string) {
  promise.catch(err => {
    dogstatsd.increment(`non_essential_promise_handler.${label}`);
    logger.error(`Error while handling ${label}`, { err });
  });
}

export type Modifications = {
  [key: string]: {
    previousValue: any;
    currentValue: any;
  };
};

function getModifications<T>(instance: Model<T>, exclusions: string[] = []): Modifications {
  const changedFieldKeys = instance.changed();
  const reducer = (mods: any, key: keyof Model<T>) => {
    const areDeeplyEqual = isEqual(instance.previous(key), instance.getDataValue(key));
    const isExcluded = exclusions.includes(key);
    if (!areDeeplyEqual && !isExcluded) {
      mods[key] = {
        previousValue: instance.previous(key),
        currentValue: instance.getDataValue(key),
      };
    }
    return mods;
  };
  return changedFieldKeys ? changedFieldKeys.reduce(reducer, {}) : {};
}

async function updateAndGetModifications<T, U>(
  instance: Model<T>,
  updates: U,
  { exclusions, transaction }: { exclusions?: string[]; transaction?: Transaction } = {},
): Promise<Modifications> {
  instance.set(updates);
  const modifications = getModifications(instance, exclusions);
  await instance.save({ transaction });
  return modifications;
}

function wrapWithGracefulShutdown<R>(
  fn: (...args: any[]) => Promise<R>,
  maxFunctionWaitTimeSeconds: number = 120,
  gracefulShutdownBufferSeconds: number = 60,
): (...args: any[]) => Promise<R | void> {
  let isShuttingDown = false;
  let inProgressCount = 0;

  async function gracefulShutdown() {
    isShuttingDown = true;
    logger.info('Shutting down...', {
      type: 'Graceful Shutdown',
    });

    const start = moment();

    // Wait for in-progress to finish
    while (inProgressCount > 0) {
      // In-progress were unable to finish within deadline, log and force kill
      if (moment().diff(start, 'seconds') > maxFunctionWaitTimeSeconds) {
        logger.error('Unable to finish processing in time for shutdown', {
          type: 'Graceful Shutdown',
          maxFunctionWaitTimeSeconds,
          inProgressCount,
        });
        process.exitCode = 1;
        break;
      }
      await sleepSeconds(1);
    }

    if (inProgressCount === 0) {
      logger.info('Shut down successful', {
        type: 'Graceful Shutdown',
        shutdownSeconds: moment().diff(start, 'seconds'),
        maxFunctionWaitTimeSeconds,
      });
    }

    // Sleep 60 seconds to allow datadog and other things to finish batches;
    await sleepSeconds(gracefulShutdownBufferSeconds);
    process.exit();
  }

  // Attach to process termination event
  process.on('SIGTERM', gracefulShutdown);

  return async (...args: any[]) => {
    // Skip when shutting down
    if (isShuttingDown) {
      return;
    }

    // Track in-progress count
    try {
      inProgressCount++;
      return await fn(...args);
    } finally {
      inProgressCount--;
    }
  };
}

function startDebugger(
  debugAgent: { start(options?: DebugAgentConfig | StackdriverConfig): Debuglet | IsReady },
  serviceName: string,
) {
  if (config.get('cloudDebugger.enabled')) {
    debugAgent.start({
      allowExpressions: true,
      projectId: config.get('googleCloud.projectId'),
      capture: {
        maxProperties: 0,
      },
      serviceContext: {
        service: serviceName,
      },
    });
  }
}

export {
  shallowMungeObjToCase,
  generateRandomHexString,
  generateRandomNumberString,
  generateMFACode,
  generateRandomNumber,
  getRandomInt,
  moveArrayItemToIndex,
  toE164,
  toNonE164Format,
  validateE164,
  validPhoneNumberRegex,
  formatCurrency,
  getParams,
  titleCase,
  formatPatch,
  deepTrim,
  validateAccountNumber,
  validateRoutingNumber,
  validateEmail,
  validateLastFourSSNFormat,
  getAvailableOrCurrentBalance,
  obfuscateEmail,
  retry,
  urlSafeBase64Encode,
  urlSafeBase64Decode,
  formatArrayToString,
  getCardScheme,
  getTimezoneFromZipCode,
  scrubTransactionName,
  sleep,
  exitGracefully,
  runTaskGracefully,
  runTaskGracefullyWithMetrics,
  processCsv,
  downloadImageAndBase64Encode,
  nonEssentialPromiseHandler,
  getModifications,
  validateMFACode,
  isLegacyMFACode,
  validatePhoneNumber,
  updateAndGetModifications,
  wrapWithGracefulShutdown,
  startDebugger,
};
