import { INTEGER, TEXT } from 'sequelize';
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
  tableName: 'side_hustle_feedback',
})
export default class SideHustleFeedback extends Model<SideHustleFeedback> {
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
    type: TEXT,
  })
  public feedback: string;

  @CreatedAt
  public created: Moment;
  @UpdatedAt
  public updated: Moment;
}
