import * as config from 'config';
import { DestroyOptions } from 'sequelize';
import { Model, Sequelize } from 'sequelize-typescript';
import { Moment, moment } from '@dave-inc/time-lib';
import { isProdEnv, isStagingEnv } from './utils';
import logger from './logger';

export const ACTIVE_TIMESTAMP = '9999-12-31 23:59:59+00:00';

export type ModelClass<T extends Model<T>> = (new () => T) & typeof Model;

export function typeCast(field: any, next: any) {
  if (field.type === 'NEWDECIMAL') {
    const result = field.string();
    return result ? parseFloat(result) : null;
  }
  if (field.type === 'TINY' && field.length === 1) {
    return field.string() === '1'; // 1 = true, 0 = false
  }
  if (field.type === 'DATE') {
    const result = field.string();
    return result ? moment(result).startOf('day') : null;
  }
  if (field.type === 'DATETIME') {
    const result = field.string();
    return result ? moment(result) : null;
  }
  return next();
}

const dialectOptions = {
  multipleStatements: !isProdEnv() && !isStagingEnv(),
  charset: 'utf8mb4',
  typeCast,
};

let connectionConfig: any = {
  host: config.get('db.host'),
  port: parseInt(config.get('db.port'), 10),
  dialectOptions: {
    ...dialectOptions,
    socketPath: (isProdEnv() || isStagingEnv()) && config.get('db.socketpath'),
  },
};

if (config.get('db.useReadReplica')) {
  connectionConfig = {
    replication: {
      write: connectionConfig,
      read: {
        host: config.get('db.replica.host'),
        port: parseInt(config.get('db.replica.port'), 10),
        dialectOptions: {
          ...dialectOptions,
          socketPath: (isProdEnv() || isStagingEnv()) && config.get('db.replica.socketpath'),
        },
      },
    },
  };
}

export function getSequelizeInstance(allModels: Array<ModelClass<any>>) {
  const sequelize = new Sequelize({
    ...connectionConfig,
    database: config.get('db.name'),
    username: config.get('db.user'),
    password: config.get('db.password'),
    dialect: 'mysql',
    logging: config.get('db.logQueries')
      ? (log: any) => logger.info('Sequelize Log', { log })
      : false,
    define: {
      charset: 'utf8mb4',
      timestamps: true,
      createdAt: 'created',
      updatedAt: 'updated',
      freezeTableName: true,
      hooks: {
        // sequelizes destroy function fails to update deletedAt due to a incorrect moment comparison
        // so lets make sure on destroy deleted gets set to now
        beforeDestroy: (instance: any, options: DestroyOptions) => {
          const field: string = instance._modelOptions.deletedAt;
          if (field && options.force === false) {
            instance.setDataValue(field, moment());
          }
        },
      },
    },
    pool: {
      max: parseInt(config.get('db.connectionLimit'), 10) || 5,
    },
  });

  // Allows Moment to be used to models.
  // XXX: don't cast like this
  (sequelize as any).Sequelize.DATE.prototype._sanitize = (value: any, options: any): Moment => {
    if ((!options || (options && !options.raw)) && !(value instanceof moment) && !!value) {
      return moment(value);
    }
    return value;
  };

  // XXX: don't cast like this
  (sequelize as any).Sequelize.DATEONLY.prototype._sanitize = (
    value: any,
    options: any,
  ): Moment => {
    if ((!options || (options && !options.raw)) && !(value instanceof moment) && !!value) {
      return moment(value).startOf('day');
    }
    return value;
  };

  // Necessary to call db operations directly via models
  sequelize.addModels(allModels);

  return sequelize;
}
