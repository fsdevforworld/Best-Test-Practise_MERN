import { DATE, ENUM, INTEGER, JSON as JSON_FIELD, STRING } from 'sequelize';
import { Column, CreatedAt, Model, Table, UpdatedAt } from 'sequelize-typescript';
import { Moment } from 'moment';
import { moment } from '@dave-inc/time-lib';

export enum Platform {
  android = 'ANDROID',
  ios = 'IOS',
}

@Table({
  tableName: 'app_store_review',
})
export default class AppStoreReview extends Model<AppStoreReview> {
  @Column({
    primaryKey: true,
    type: INTEGER,
  })
  public id: number;

  @Column({
    type: STRING,
  })
  public subject: string;

  @Column({
    type: STRING,
  })
  public body: string;

  @Column({
    type: INTEGER,
  })
  public rating: number;

  @Column({
    type: ENUM('ANDROID', 'IOS'),
  })
  public platform: Platform;

  @Column({
    type: STRING,
  })
  public author: string;

  @Column({
    type: JSON_FIELD,
  })
  public extra: any;

  @Column({
    field: 'published_date',
    type: DATE,
    defaultValue: moment(),
  })
  public publishedDate: Moment;

  @CreatedAt
  public created: Moment;
  @UpdatedAt
  public updated: Moment;
}
