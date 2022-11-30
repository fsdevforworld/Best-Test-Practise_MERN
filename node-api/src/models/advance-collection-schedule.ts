import { DATEONLY, INTEGER } from 'sequelize';
import {
  BelongsTo,
  Column,
  CreatedAt,
  ForeignKey,
  Model,
  Table,
  UpdatedAt,
} from 'sequelize-typescript';

import { Moment } from 'moment';

import Advance from './advance';
import Payment from './payment';

@Table({
  tableName: 'advance_collection_schedule',
})
export default class AdvanceCollectionSchedule extends Model<AdvanceCollectionSchedule> {
  @Column({
    autoIncrement: true,
    primaryKey: true,
    type: INTEGER,
  })
  public id: number;

  @CreatedAt
  public created: Moment;

  @UpdatedAt
  public updated: Moment;

  @Column({
    type: DATEONLY,
    field: 'window_start',
  })
  public windowStart: Moment;

  @Column({
    type: DATEONLY,
    field: 'window_end',
  })
  public windowEnd: Moment;

  @ForeignKey(() => Advance)
  @Column({
    field: 'advance_id',
    type: INTEGER,
  })
  public advanceId: number;

  @BelongsTo(() => Advance)
  public advance: Advance;

  @ForeignKey(() => Payment)
  @Column({
    field: 'payment_id',
    type: INTEGER,
  })
  public paymentId: number;

  @BelongsTo(() => Payment)
  public payment: Payment;
}
