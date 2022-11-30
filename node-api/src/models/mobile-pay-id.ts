import { CHAR, INTEGER } from 'sequelize';
import * as crypto from 'crypto';
import {
  BelongsTo,
  UpdatedAt,
  CreatedAt,
  Column,
  ForeignKey,
  Model,
  Table,
} from 'sequelize-typescript';
import { Moment } from 'moment';

import User from './user';

@Table({
  tableName: 'mobilepay_id',
  updatedAt: false,
})
export default class MobilePayID extends Model<MobilePayID> {
  public static hashAccountID(data: string | number) {
    return crypto
      .createHash('sha256')
      .update(String(data), 'utf8')
      .digest('base64');
  }

  @Column({
    autoIncrement: true,
    primaryKey: true,
    type: INTEGER,
  })
  public id: number;

  @Column({
    field: 'mobilepay_unique_id',
    type: CHAR(44),
    allowNull: false,
  })
  public mobilePayID: string;

  @ForeignKey(() => User)
  @Column({
    field: 'user_id',
    type: INTEGER,
  })
  public userId: number;

  @BelongsTo(() => User)
  public user: User;

  @CreatedAt
  public created: Moment;

  @UpdatedAt
  public updated: Moment;
}
