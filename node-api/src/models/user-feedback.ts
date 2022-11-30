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
  tableName: 'user_feedback',
})
export default class UserFeedback extends Model<UserFeedback> {
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
    type: STRING(2000),
  })
  public feedback: string;

  @Column({
    type: STRING(256),
  })
  public context: string;

  @CreatedAt
  public created: Moment;
  @UpdatedAt
  public updated: Moment;
}
