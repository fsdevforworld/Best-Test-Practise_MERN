import { Moment } from '@dave-inc/time-lib';
import {
  BelongsTo,
  Column,
  CreatedAt,
  ForeignKey,
  Model,
  Table,
  UpdatedAt,
} from 'sequelize-typescript';
import { BOOLEAN, DECIMAL, ENUM, INTEGER } from 'sequelize';

import AdvanceRefund from './advance-refund';

export const reasons = ['fee', 'tip', 'overdraft', 'overpayment'] as const;

@Table({
  tableName: 'advance_refund_line_item',
})
export default class AdvanceRefundLineItem extends Model<AdvanceRefundLineItem> {
  @Column({
    autoIncrement: true,
    primaryKey: true,
    type: INTEGER,
  })
  public id: number;

  @ForeignKey(() => AdvanceRefund)
  @Column({
    field: 'advance_refund_id',
    type: INTEGER,
  })
  public advanceRefundId: number;

  @BelongsTo(() => AdvanceRefund)
  public advanceRefund: AdvanceRefund;

  @Column({
    type: ENUM(...reasons),
  })
  public reason: typeof reasons[number];

  @Column({
    type: DECIMAL(16, 2),
  })
  public amount: number;

  @Column({
    type: BOOLEAN,
    field: 'adjust_outstanding',
    defaultValue: false,
  })
  public adjustOutstanding: boolean;

  @CreatedAt
  public created: Moment;

  @UpdatedAt
  public updated: Moment;
}
