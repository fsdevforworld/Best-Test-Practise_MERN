import {
  col,
  FindOptions,
  fn,
  Includeable,
  Op,
  Sequelize as SequelizeOrigin,
  Transaction,
  WhereOptions,
  WhereValue,
} from 'sequelize';
import logger from './logger';
import * as Bluebird from 'bluebird';
import { Model } from 'sequelize-typescript';
import { isEmpty, last } from 'lodash';
import { processInBatches } from './utils';
import { ModelClass } from './sequelize';
import { sequelize } from '../models';

const DEADLOCK_ERROR = 'ER_LOCK_DEADLOCK';
const MAX_DELAY = 32000;
const DEFAULT_PAGE_SIZE = 10000;

export async function retryWhenDeadlocked<T>(
  sequelizeInstance: SequelizeOrigin,
  query: (t: Transaction) => PromiseLike<T>,
  delay: number = 1000,
  maxRetries = 8,
): Promise<T> {
  try {
    const result = await sequelizeInstance.transaction(
      { isolationLevel: Transaction.ISOLATION_LEVELS.READ_UNCOMMITTED },
      query,
    );
    return result;
  } catch (error) {
    const sqlErrorCode = error && error.original && error.original.code;
    if (sqlErrorCode === DEADLOCK_ERROR && delay <= MAX_DELAY && maxRetries > 0) {
      logger.info('Found Deadlock Error', { delay, msg: 'retrying', error });
      await Bluebird.delay(delay);
      return retryWhenDeadlocked<T>(sequelizeInstance, query, delay * 2, maxRetries - 1);
    } else {
      throw error;
    }
  }
}

/**
 * Performs a bulk insert, with some robustness to deadlock errors. Note
 * that under the hood this runs Sequelize.bulkCreate, whose returned
 * objects do not necessarily mirror the state of rows in the DB.
 *
 * @param {T extends Model} ResourceType - derived class of Sequelize Model
 * @param {T => Array<Partial<T>} rows - rows to insert
 */
export async function bulkInsertAndRetry<T extends Model<T>>(
  ResourceType: ModelClass<T>,
  rows: object[],
  delay: number = 1000,
  maxRetries = 8,
): Promise<T[]> {
  if (isEmpty(rows)) {
    return [];
  } else {
    const query = (transaction: Transaction) => {
      return ResourceType.bulkCreate<T>(rows, {
        transaction,
        ignoreDuplicates: true,
      });
    };

    return retryWhenDeadlocked(ResourceType.sequelize, query, delay, maxRetries);
  }
}

export async function streamQuery<T = any>(
  query: string,
  processor: (data: T) => Promise<any> | any,
  concurrency: number = 10,
  queryParameterReplacements?: Array<string | number | boolean>,
) {
  let concurrentProcesses = 0;
  // Need to finish processing stream on error https://github.com/sidorares/node-mysql2/issues/664
  let keepProcessing = true;
  const connection: any = await sequelize.connectionManager.getConnection({
    type: 'write',
    useMaster: true,
  });
  const allPromises: Set<Promise<any>> = new Set();
  await new Promise((accept, reject) => {
    const stream = connection.query(query, queryParameterReplacements);
    // on error release connection and fail the promise
    const onError = async (error: any) => {
      keepProcessing = false;
      await sequelize.connectionManager.releaseConnection(connection);
      reject(error);
    };

    const processRow = async (row: T) => {
      if (!keepProcessing) {
        return;
      }
      concurrentProcesses += 1;
      if (concurrentProcesses >= concurrency) {
        connection.pause();
      }
      try {
        await processor(row);
        concurrentProcesses -= 1;
      } catch (error) {
        logger.error('streamQuery result event encountered error', { error });
        await onError(error);
      } finally {
        connection.resume();
      }
    };

    stream.on('result', async (row: T) => {
      const promise = processRow(row);
      allPromises.add(promise);
      await promise;
      allPromises.delete(promise);
    });

    stream.on('end', accept);

    stream.on('error', (error: any) => {
      logger.error('streamQuery error event triggered', { error });

      return onError(error);
    });
  });
  await sequelize.connectionManager.releaseConnection(connection);
  await Promise.all(allPromises);
}

/**
 * Like streamQuery, but using Sequelize's findAll interface
 * to fetch data. Expects a numeric primary key.
 * @param {T extends Model} ResourceType - derived class of Sequelize Model
 * @param {FindOptions} baseQuery - query parameters
 * @param {T => Promise<any> | any} processor - data handler functoin
 * @param {number} pageSize - row limit of querys to DB. Controls I/O overhead
 * @param {number} concurrency - max parallel processor invocations. Controls
 *                               threading overhead
 */
export async function streamFindAll<T extends Model<T>>(
  ResourceType: ModelClass<T>,
  baseQuery: FindOptions,
  processor: (data: T, offset: number) => Promise<any> | any,
  pageSize: number = DEFAULT_PAGE_SIZE,
  concurrency: number = 10,
): Promise<number> {
  const getBatch = (limit: number, offset: number, previous?: T[] | null) => {
    const pkey = ResourceType.primaryKeyAttribute;
    const lastElem = last(previous);
    const where = {
      ...baseQuery.where,
      [pkey]: { [Op.gte]: lastElem?.get(pkey) ?? 0 },
    };
    const query: FindOptions = {
      ...baseQuery,
      where,
      limit,
      order: [[pkey, 'ASC']],
    };
    return ResourceType.findAll<T>(query);
  };

  const processBatch = async (results: T[], offset: number) => {
    await Bluebird.map(results, (elem, idx) => processor(elem, offset + idx), { concurrency });
  };

  return processInBatches<T>(getBatch, processBatch, pageSize);
}

export async function withAssociationCounts<T extends Model<T>>(
  ResourceType: ModelClass<T>,
  associations: Array<AssociationOptions<any>>,
  baseQuery: FindOptions,
): Promise<T[]> {
  const modelName = ResourceType.name;
  const modelAssociations = Object.keys(ResourceType.associations);

  const finalQuery: any = Object.assign({}, baseQuery);

  const baseQueryAttributes = baseQuery.attributes || ({ include: [] } as any);
  const baseAttributeInclude = baseQueryAttributes.include || [];
  const baseInclude: Includeable[] = baseQuery.include || [];

  finalQuery.attributes = {
    include: [...baseAttributeInclude],
  };
  finalQuery.include = [...baseInclude];
  finalQuery.group = ['id'];
  finalQuery.having = baseQuery.having || {};
  finalQuery.where = baseQuery.where;

  associations.forEach(({ name, model, required = false, where, having }) => {
    if (!modelAssociations.includes(name)) {
      throw new TypeError(
        `${name} is not a defined association of ${modelName}. If you meant to query for ${name}, please define it in the ${modelName} model's class definition`,
      );
    }

    const countAttribute = `${name}Count`;

    finalQuery.attributes.include.push([fn('COUNT', col(`${name}.id`)), countAttribute]);

    finalQuery.include.push({
      model,
      attributes: [],
      as: name,
      required,
      where,
    });

    if (having) {
      finalQuery.having[countAttribute] = having;
    }
  });

  return ResourceType.findAll<T>(finalQuery);
}

type AssociationOptions<T extends Model<T>> = {
  name: string;
  model: ModelClass<T>;
  required?: boolean;
  having?: {
    [operator: string]: WhereValue | WhereOptions;
  };
  where?: WhereOptions;
};

export enum RecoverableMySQLErrorCode {
  Deadlock = 'ER_LOCK_DEADLOCK',
  Uniqueness = 'ER_DUP_ENTRY',
  ForeignKeyChild = 'ER_NO_REFERENCED_ROW',
  ForeignKeyChild2 = 'ER_NO_REFERENCED_ROW_2',
}

export function isRecoverableMySQLError(error: any): boolean {
  const mySQLError = getMySQLError(error);

  if (!mySQLError) {
    return false;
  }

  return Object.values(RecoverableMySQLErrorCode).includes(mySQLError);
}

export function getMySQLError(error: any): RecoverableMySQLErrorCode | undefined {
  return error && error.original && error.original.code;
}
