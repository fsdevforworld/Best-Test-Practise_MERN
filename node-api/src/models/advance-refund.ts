import { Moment } from '@dave-inc/time-lib';
import {
  BelongsTo,
  Column,
  CreatedAt,
  ForeignKey,
  HasMany,
  Model,
  Scopes,
  Table,
} from 'sequelize-typescript';
import { INTEGER, BelongsToGetAssociationMixin, HasManyGetAssociationsMixin } from 'sequelize';

import Advance from './advance';
import AdvanceRefundLineItem from './advance-refund-line-item';
import Reimbursement from './reimbursement';

@Scopes(() => ({
  withChangelogData: () => ({
    include: [
      AdvanceRefundLineItem,
      {
        model: Reimbursement.scope('withDashboardAction'),
      },
    ],
  }),
}))
@Table({
  tableName: 'advance_refund',
  timestamps: true,
  updatedAt: false,
})
export default class AdvanceRefund extends Model<AdvanceRefund> {
  @Column({
    autoIncrement: true,
    primaryKey: true,
    type: INTEGER,
  })
  public id: number;

  @ForeignKey(() => Advance)
  @Column({
    field: 'advance_id',
    type: INTEGER,
  })
  public advanceId: number;

  @BelongsTo(() => Advance)
  public advance: Advance;

  @ForeignKey(() => Reimbursement)
  @Column({
    field: 'reimbursement_id',
    type: INTEGER,
  })
  public reimbursementId: number;

  @BelongsTo(() => Reimbursement)
  public reimbursement: Reimbursement;
  public getReimbursement: BelongsToGetAssociationMixin<Reimbursement>;

  @HasMany(() => AdvanceRefundLineItem)
  public advanceRefundLineItems: AdvanceRefundLineItem[];
  public getAdvanceRefundLineItems: HasManyGetAssociationsMixin<AdvanceRefundLineItem>;

  @CreatedAt
  public created: Moment;
}
