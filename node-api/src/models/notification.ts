import { INTEGER, STRING } from 'sequelize';
import { Column, CreatedAt, Model, Table } from 'sequelize-typescript';
import { Moment } from '@dave-inc/time-lib';

export enum NotificationType {
  AUTO_ADVANCE_APPROVAL = 'AUTO_ADVANCE_APPROVAL',
  LOW_BALANCE = 'LOW_BALANCE',
}

@Table({
  tableName: 'notification',
  updatedAt: false,
})
export default class Notification extends Model<Notification> {
  @Column({
    autoIncrement: true,
    primaryKey: true,
    type: INTEGER,
  })
  public id: number;

  @Column({
    type: STRING(256),
  })
  public type: NotificationType;

  @CreatedAt
  public created: Moment;
}
