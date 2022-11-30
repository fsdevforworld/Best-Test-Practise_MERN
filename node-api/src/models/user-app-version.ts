import { Moment } from 'moment';
import { INTEGER, NOW, DATE, STRING } from 'sequelize';
import { BelongsTo, Column, ForeignKey, Model, Table } from 'sequelize-typescript';

import User from './user';

@Table({
  timestamps: false,
  tableName: 'user_app_version',
})
export default class UserAppVersion extends Model<UserAppVersion> {
  @ForeignKey(() => User)
  @Column({
    type: INTEGER,
    field: 'user_id',
    primaryKey: true,
  })
  public userId: number;

  @BelongsTo(() => User)
  public user: User;

  @Column({
    type: STRING(10),
    field: 'app_version',
    primaryKey: true,
  })
  public appVersion: string;

  @Column({
    type: STRING(10),
    field: 'device_type',
    primaryKey: true,
  })
  public deviceType: string;

  @Column({
    type: DATE,
    field: 'first_seen',
    defaultValue: NOW,
  })
  public firstSeen: Moment;

  @Column({
    type: DATE,
    field: 'last_seen',
    defaultValue: NOW,
  })
  public lastSeen: Moment;
}
