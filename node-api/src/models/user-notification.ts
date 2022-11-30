import { BOOLEAN, INTEGER } from 'sequelize';
import {
  BelongsTo,
  Column,
  CreatedAt,
  DeletedAt,
  ForeignKey,
  Model,
  Table,
  UpdatedAt,
} from 'sequelize-typescript';
import { serializeDate } from '../serialization';
import Notification from './notification';
import User from './user';
import { UserNotificationResponse } from '@dave-inc/wire-typings';
import { ISerializable } from '../typings';

@Table({
  tableName: 'user_notification',
})
export default class UserNotification extends Model<UserNotification>
  implements ISerializable<UserNotificationResponse> {
  @Column({
    autoIncrement: true,
    primaryKey: true,
    type: INTEGER,
  })
  public id: number;

  @ForeignKey(() => User)
  @Column({
    type: INTEGER,
    field: 'user_id',
  })
  public userId: number;

  @BelongsTo(() => User)
  public user: User;

  @ForeignKey(() => Notification)
  @Column({
    type: INTEGER,
    field: 'notification_id',
  })
  public notificationId: number;

  @BelongsTo(() => Notification)
  public notification: Notification;

  @Column({
    type: BOOLEAN,
    field: 'sms_enabled',
  })
  public smsEnabled: boolean;

  @Column({
    type: BOOLEAN,
    field: 'push_enabled',
  })
  public pushEnabled: boolean;

  @Column({
    type: BOOLEAN,
    field: 'email_enabled',
  })
  public emailEnabled: boolean;

  @Column({
    type: INTEGER,
    field: 'threshold',
  })
  public threshold: number;

  @CreatedAt
  public created: Date;

  @UpdatedAt
  public updated: Date;

  @DeletedAt
  public deleted: Date;

  public serialize(): UserNotificationResponse {
    return {
      id: this.id,
      userId: this.userId,
      notificationId: this.notificationId,
      pushEnabled: this.pushEnabled,
      smsEnabled: this.smsEnabled,
      emailEnabled: this.emailEnabled,
      threshold: this.threshold,
      deleted: serializeDate(this.deleted),
      created: serializeDate(this.created),
      updated: serializeDate(this.updated),
    };
  }
}
