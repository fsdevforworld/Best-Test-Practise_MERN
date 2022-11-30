import { INTEGER, UUIDV4, BOOLEAN, STRING } from 'sequelize';
import {
  BelongsTo,
  Column,
  ForeignKey,
  Model,
  Table,
  DeletedAt,
  CreatedAt,
} from 'sequelize-typescript';
import { Moment } from '@dave-inc/time-lib';
import User from './user';

export enum UserSessionScopes {
  byDeviceIdAndToken = 'byDeviceIdAndToken',
}
@Table({
  tableName: 'user_session',
  updatedAt: false,
  paranoid: true,
})
export default class UserSession extends Model<UserSession> {
  @Column({
    autoIncrement: true,
    primaryKey: true,
    type: INTEGER,
  })
  public id: number;

  @Column({
    type: STRING(),
    field: 'token',
    defaultValue: UUIDV4,
  })
  public token: string;

  @ForeignKey(() => User)
  @Column({
    field: 'user_id',
    type: INTEGER,
  })
  public userId: number;

  @BelongsTo(() => User)
  public user: User;
  public getUser: () => Promise<User>;

  @Column({
    type: STRING(),
    field: 'device_id',
  })
  public deviceId: string;

  @Column({
    type: STRING(),
    field: 'device_type',
  })
  public deviceType: string;

  @Column({
    type: BOOLEAN,
    field: 'admin_login_override',
  })
  public adminLoginOverride: boolean;

  @CreatedAt
  public created: Moment;

  @DeletedAt
  public revoked: Moment;
}
