import { INTEGER, STRING } from 'sequelize';
import { Column, Model, Table } from 'sequelize-typescript';

import { SettingName } from '../typings';

@Table({
  paranoid: false,
  tableName: 'user_setting_name',
  timestamps: false,
})
export default class UserSettingName extends Model<UserSettingName> {
  @Column({
    autoIncrement: true,
    primaryKey: true,
    type: INTEGER,
  })
  public id: number;

  /**
   *  because the database column is a string, just add an enum member to `SettingName`
   *  to support more settings
   */
  @Column({
    type: STRING(256),
  })
  public name: SettingName;
}
