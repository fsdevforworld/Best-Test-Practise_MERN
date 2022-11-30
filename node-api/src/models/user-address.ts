import { INTEGER, STRING } from 'sequelize';
import {
  Column,
  CreatedAt,
  Model,
  Table,
  UpdatedAt,
  ForeignKey,
  BelongsTo,
} from 'sequelize-typescript';
import { Moment } from 'moment';

import User from './user';

@Table({
  tableName: 'user_address',
})
export default class UserAddress extends Model<UserAddress> {
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
    type: STRING(256),
    field: 'address_line1',
  })
  public addressLine1: string;

  @Column({
    type: STRING(256),
    field: 'address_line2',
  })
  public addressLine2: string;

  @Column({
    type: STRING(256),
  })
  public city: string;

  @Column({
    type: STRING(6),
  })
  public state: string;

  @Column({
    type: STRING(12),
    field: 'zip_code',
  })
  public zipCode: string;

  @CreatedAt
  public created: Moment;
  @UpdatedAt
  public updated: Moment;
}
