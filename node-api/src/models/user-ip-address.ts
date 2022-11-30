import { Moment } from 'moment';
import { INTEGER, NOW, DATE, STRING } from 'sequelize';
import { BelongsTo, Column, ForeignKey, Model, Table } from 'sequelize-typescript';

import User from './user';

@Table({
  timestamps: false,
  tableName: 'user_ip_address',
})
export default class UserIpAddress extends Model<UserIpAddress> {
  @ForeignKey(() => User)
  @Column({
    type: INTEGER,
    field: 'user_id',
    primaryKey: true, // not really primary but removes the need for removing id field
  })
  public userId: number;

  @BelongsTo(() => User)
  public user: User;

  @Column({
    type: STRING(40),
    field: 'ip_address',
  })
  public ipAddress: string;

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
