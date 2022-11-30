import { BOOLEAN, INTEGER } from 'sequelize';
import { BelongsTo, CreatedAt, Column, ForeignKey, Model, Table } from 'sequelize-typescript';
import { Moment } from 'moment';

import User from './user';

@Table({
  tableName: 'avs_log',
  updatedAt: false,
})
export default class AVSLog extends Model<AVSLog> {
  @Column({
    autoIncrement: true,
    primaryKey: true,
    type: INTEGER,
  })
  public id: number;

  @ForeignKey(() => User)
  @Column({
    field: 'user_id',
    type: INTEGER,
  })
  public userId: number;

  @BelongsTo(() => User)
  public user: User;

  @Column({
    field: 'payment_method_id',
    type: INTEGER,
  })
  public paymentMethodId?: number;

  @Column({
    type: BOOLEAN,
    field: 'address_match',
    defaultValue: false,
  })
  public addressMatch: boolean;

  @Column({
    type: BOOLEAN,
    field: 'cvv_match',
    defaultValue: false,
  })
  public cvvMatch: boolean;

  @Column({
    type: BOOLEAN,
    field: 'zip_match',
    defaultValue: false,
  })
  public zipMatch: boolean;

  @CreatedAt
  public created: Moment;
}
