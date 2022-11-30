import { Moment } from 'moment';
import { STRING, INTEGER } from 'sequelize';
import {
  BelongsTo,
  Column,
  CreatedAt,
  ForeignKey,
  Model,
  Table,
  UpdatedAt,
  DeletedAt,
} from 'sequelize-typescript';

import User from './user';

@Table({
  tableName: 'password_history',
})
export default class PasswordHistory extends Model<PasswordHistory> {
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
    type: STRING(64),
  })
  public password: string;

  @CreatedAt
  public created: Moment;

  @UpdatedAt
  public updated: Moment;

  @DeletedAt
  public deleted: Moment;
}
