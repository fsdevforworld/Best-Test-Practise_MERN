import { Moment } from 'moment';
import { DATE, STRING, BOOLEAN, INTEGER, JSON as SQLJSON } from 'sequelize';
import { BeforeCreate, BelongsTo, Column, ForeignKey, Model, Table } from 'sequelize-typescript';
import ErrorHelper from '@dave-inc/error-helper';
import { omitBy, isNil } from 'lodash';

import User from './user';

export interface IAuditLog {
  id: number;
  userId: number;
  user?: User;
  type: string;
  successful: boolean;
  eventUuid: string;
  message: string;
  extra?: any;
  created: Moment;
  eventType: string;
}
@Table({
  tableName: 'audit_log',
  updatedAt: false,
})
export default class AuditLog extends Model<AuditLog> implements IAuditLog {
  public static TYPES = {
    COVID_19_JOBLOSS: 'COVID_19_JOBLOSS',
    DETECT_INCOME_ACCOUNT_TRANSITION: 'DETECT_INCOME_ACCOUNT_TRANSITION',
    HUSTLE_JOB_PACK_UPDATED: 'HUSTLE_JOB_PACK_UPDATED',
    IDENTITY_VERIFICATION: 'IDENTITY_VERIFICATION',
    IDENTITY_VERIFICATION_ENDPOINT: 'IDENTITY_VERIFICATION_ENDPOINT',
    NAME_UPDATE_FROM_ADD_ROUTING: 'NAME_UPDATE_FROM_ADD_ROUTING',
    REDEEMED_SUBSCRIPTION_BILLING_PROMOTION: 'REDEEMED_SUBSCRIPTION_BILLING_PROMOTION',
    USER_PROFILE_UPDATE: 'USER_PROFILE_UPDATE',
    USER_PROFILE_UPDATE_NAME: 'USER_PROFILE_UPDATE_NAME',
    WAIVE_SUBSCRIPTION_MONTH: 'WAIVE_SUBSCRIPTION_MONTH',
  };

  @BeforeCreate
  public static transformToExtra(model: AuditLog, options: any) {
    const extra = model.extra;

    if (extra instanceof Error) {
      model.extra = formatError(extra);
    } else if (typeof extra === 'object') {
      model.extra = Object.getOwnPropertyNames(extra).reduce((acc, key) => {
        const value = extra[key];
        if (value instanceof Error) {
          acc[key] = formatError(value);
        } else {
          acc[key] = value;
        }

        return acc;
      }, {} as Record<string, any>);
    }
  }

  @Column({
    autoIncrement: true,
    primaryKey: true,
    type: INTEGER,
  })
  public id: number;

  @ForeignKey(() => User)
  @Column({
    field: 'user_id',
    type: INTEGER,
  })
  public userId: number;

  @BelongsTo(() => User)
  public user: User;

  @Column({
    type: STRING(256),
  })
  public type: string;

  @Column({
    type: BOOLEAN,
  })
  public successful: boolean;

  @Column({
    type: STRING(256),
    field: 'event_uuid',
  })
  public eventUuid: string;

  @Column({
    type: STRING(256),
  })
  public message: string;

  @Column({
    type: SQLJSON,
  })
  public extra: any;

  @Column({
    type: DATE,
  })
  public created: Moment;

  @Column({
    type: STRING(256),
    field: 'event_type',
  })
  public eventType: string;
}

function formatError(error: Error) {
  const result: Record<string, any> = {};

  if (isErrorWithData(error)) {
    result.data = omitBy(error.data, isNil);
  }

  return Object.assign(ErrorHelper.logFormat(error), result);
}

interface IErrorWithData extends Error {
  data: any;
}

function isErrorWithData(err: Error): err is IErrorWithData {
  return 'data' in err;
}
