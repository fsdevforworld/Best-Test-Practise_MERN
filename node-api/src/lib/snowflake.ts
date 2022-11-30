import { once } from 'lodash';
import * as config from 'config';
import * as snowflake from 'snowflake-sdk';
import { Moment, moment } from '@dave-inc/time-lib';

import { isProdEnv, isStagingEnv } from './utils';
import logger from './logger';

const getConnection = once(
  (): Promise<snowflake.Connection> => {
    const conn = snowflake.createConnection(config.get('snowflake'));
    return new Promise((res, rej) => {
      if (isProdEnv() || isStagingEnv()) {
        conn.connect(err => {
          if (err) {
            logger.error('Unable to connect to snowflake', { err });
            rej(err);
          } else {
            logger.info('Connected to Snowflake');
            res(conn);
          }
        });
      } else {
        res(conn);
      }
    });
  },
);

async function disconnect(): Promise<snowflake.Connection> {
  const connection = await getConnection();
  return new Promise((res, rej) => {
    connection.destroy((err, conn) => {
      if (err) {
        rej(err);
      } else {
        res(conn);
      }
    });
  });
}

async function query<T>(sqlText: string, binds: snowflake.Binds = []): Promise<T[]> {
  const connection = await getConnection();
  return new Promise((res, rej) => {
    connection.execute({
      sqlText,
      binds,
      complete(err: Error, _stmt: snowflake.Statement, rows: T[]) {
        if (err) {
          rej(err);
        } else {
          res(rows);
        }
      },
    });
  });
}

async function stream<T>(
  sqlText: string,
  binds: snowflake.Binds = [],
): Promise<NodeJS.ReadableStream> {
  const connection = await getConnection();

  // Typings is incorrect, calling with no provided callback returns a
  // Statement
  // https://docs.snowflake.com/en/user-guide/nodejs-driver-use.html#streaming-results
  return new Promise<NodeJS.ReadableStream>((res, rej) => {
    connection.execute({
      sqlText,
      binds,
      streamResult: true,
      complete(err: Error, statement: snowflake.Statement) {
        if (err) {
          rej(err);
        } else {
          res(statement.streamRows());
        }
      },
    });
  });
}

function formatDatetime(date: string | Date | Moment): string {
  return moment(date).format('YYYY-MM-DDTHH:mm:ss.SSSZ');
}

export default {
  disconnect,
  formatDatetime,
  query,
  stream,
};
