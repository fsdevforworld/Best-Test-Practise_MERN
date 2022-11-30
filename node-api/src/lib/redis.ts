import * as Bluebird from 'bluebird';
import * as redis from 'redis';
import * as config from 'config';
import { isTestEnv } from './utils';

const REDIS_HOST = config.get('redis.api.host');
const REDIS_PORT = config.get('redis.api.port');
const REDIS_DB = config.get('redis.api.db');

if (!REDIS_HOST || !REDIS_PORT || !REDIS_DB) {
  throw new Error(
    'REDIS_HOST, REDIS_PORT, and REDIS_DB environmnent variables are not set on host',
  );
}

interface IPromisifiedRedisClient extends redis.RedisClient {
  delAsync(key: string): Promise<void>;

  getAsync(key: string): Promise<string>;

  keysAsync(pattern: string): Promise<string[]>;

  setAsync(key: string, value: string | number): Promise<void>;

  setAsync(args: Array<string | number | boolean>): Promise<void>;

  setexAsync(key: string, seconds: number, value: string | number): Promise<void>;

  getsetAsync(key: string, value: string): Promise<string>;

  flushallAsync(): Promise<void>;

  flushdbAsync(): Promise<void>;

  ttlAsync(key: string): Promise<number>;

  sismemberAsync(key: string, member: string): Promise<number>;

  sremAsync(key: string, member: string): Promise<number>;

  saddAsync(key: string, member: string): Promise<number>;

  lpushAsync(key: string, member: string | number | boolean): Promise<number>;

  lrangeAsync(key: string, start: number, end: number): Promise<string[]>;

  expireAsync(key: string, expireTime: number): Promise<number>;

  typeAsync(key: string): Promise<string>;

  hmsetAsync(key: string, ...args: Array<string | number>): Promise<string>;

  hmsetAsync(key: string, hash: { [key: string]: string | number | boolean }): Promise<string>;

  hgetAsync(key: string, field: string): Promise<string>;

  hgetallAsync(key: string): Promise<{ [key: string]: string }>;

  hgetallAsync<T>(key: string): Promise<T>;

  incrAsync<T>(key: string): Promise<boolean>;

  existsAsync(key: string): Promise<number>;

  hincrbyAsync(key: string, field: string, increment: number): Promise<number>;

  evalAsync<T>(script: string, numKeys: number, ...keys: Array<number | string>): Promise<T>;
}

/**
 * Returns true if the set succeeds and false if it already exists.
 *
 * redis> SET keykey value NX EX 60
 * "OK"
 * redis> SET keykey value NX EX 60
 * (nil)
 */
export async function setNxEx(key: string, ttlSeconds: number, value: string): Promise<boolean> {
  const okOrNil = await redisClient.setAsync([key, value, 'NX', 'EX', ttlSeconds]);

  return Boolean(okOrNil);
}

let redisClient: IPromisifiedRedisClient;

export function initializeRedisClient() {
  const redisClientSync = redis.createClient(`redis://${REDIS_HOST}:${REDIS_PORT}/${REDIS_DB}`);
  redisClient = Bluebird.promisifyAll(redisClientSync) as IPromisifiedRedisClient;
}

// TODO eventually possible force everything to initialize manually
if (!isTestEnv()) {
  initializeRedisClient();
}

// exporting this way or lazy initialization will not work
export { redisClient as default };
