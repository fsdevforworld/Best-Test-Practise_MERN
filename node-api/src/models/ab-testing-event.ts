import { Moment } from 'moment';
import { STRING, INTEGER, JSON as SQLJSON } from 'sequelize';
import {
  BelongsTo,
  Column,
  CreatedAt,
  ForeignKey,
  Model,
  Table,
  UpdatedAt,
} from 'sequelize-typescript';

import User from './user';

@Table({
  tableName: 'ab_testing_event',
  updatedAt: false,
})
export default class ABTestingEvent extends Model<ABTestingEvent> {
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
    field: 'event_name',
  })
  public eventName: string;

  @Column({
    type: SQLJSON,
  })
  public extra: any;

  @Column({
    type: SQLJSON,
  })
  public variables: any;

  @Column({
    type: SQLJSON,
  })
  public results: any;

  @Column({
    type: INTEGER,
    field: 'event_uuid',
  })
  public eventUuid: number;

  @CreatedAt
  public created: Moment;

  @UpdatedAt
  public updated: Moment;
}
