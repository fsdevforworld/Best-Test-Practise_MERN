import { INTEGER, STRING } from 'sequelize';
import {
  BelongsTo,
  Column,
  CreatedAt,
  ForeignKey,
  Model,
  Table,
  UpdatedAt,
} from 'sequelize-typescript';

import { Moment } from '@dave-inc/time-lib';

import User from './user';
import UserSettingName from './user-setting-name';

@Table({
  paranoid: false,
  tableName: 'user_setting',
})
export default class UserSetting extends Model<UserSetting> {
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

  @ForeignKey(() => UserSettingName)
  @Column({
    type: INTEGER,
    field: 'user_setting_name_id',
  })
  public userSettingNameId: number;
  @BelongsTo(() => UserSettingName)
  public userSettingName: UserSettingName;

  /**
   * We want this column to be flexible at a database level to
   * limit the number of migrations we need to run. However,
   * a DAO layer could enforce more domain validation and
   * treat our actual domain model as a key-value store
   */
  @Column({
    type: STRING(256),
  })
  public value: string;

  @CreatedAt
  public created: Moment;

  @UpdatedAt
  public updated: Moment;
}
