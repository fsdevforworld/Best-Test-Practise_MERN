import { INTEGER, TEXT } from 'sequelize';
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

@Table({
  tableName: 'credit_pop_code',
  updatedAt: false,
})
export default class CreditPopCode extends Model<CreditPopCode> {
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
    type: new TEXT('tiny'),
    field: 'code',
  })
  public code: string;

  @CreatedAt
  public created: Moment;

  @UpdatedAt
  public updated: Moment;
}
