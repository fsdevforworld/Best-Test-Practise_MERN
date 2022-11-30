import { Moment } from 'moment';
import { ENUM, INTEGER, STRING } from 'sequelize';
import { BelongsTo, CreatedAt, Column, ForeignKey, Model, Table } from 'sequelize-typescript';

import User from './user';

export enum AlertType {
  SMS = 'SMS',
  Email = 'EMAIL',
  Push = 'PUSH',
}

@Table({
  tableName: 'alert',
  updatedAt: false,
})
export default class Alert extends Model<Alert> {
  @Column({
    autoIncrement: true,
    primaryKey: true,
    type: INTEGER,
  })
  public id: number;

  @CreatedAt
  public created: Moment;

  @ForeignKey(() => User)
  @Column({
    field: 'user_id',
    type: INTEGER,
  })
  public userId: number;

  @BelongsTo(() => User)
  public user: User;

  @Column({
    type: ENUM('SMS', 'EMAIL', 'PUSH'),
  })
  public type: AlertType;

  @Column({
    type: STRING(255),
  })
  public subtype: string;

  @Column({
    type: STRING(256),
    field: 'event_uuid',
  })
  public eventUuid: string;

  @Column({
    type: STRING(255),
    field: 'event_type',
  })
  public eventType: string;
}
