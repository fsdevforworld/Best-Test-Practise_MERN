import { BelongsToGetAssociationMixin, HasManyGetAssociationsMixin, STRING } from 'sequelize';
import { Column, HasMany, Model, Table, ForeignKey, BelongsTo } from 'sequelize-typescript';
import Payment from './payment';

import DashboardAdvanceRepayment from './dashboard-advance-repayment';

@Table({
  tableName: 'dashboard_payment',
  timestamps: false,
})
export default class DashboardPayment extends Model<DashboardPayment> {
  @Column({
    field: 'tivan_reference_id',
    type: STRING(256),
    primaryKey: true,
  })
  public tivanReferenceId: string;

  @ForeignKey(() => DashboardAdvanceRepayment)
  @Column({
    field: 'tivan_task_id',
    type: STRING(256),
    primaryKey: true,
  })
  public tivanTaskId: string;

  @BelongsTo(() => DashboardAdvanceRepayment)
  public dashboardAdvanceRepayment: DashboardAdvanceRepayment;
  public getDashboardAdvanceRepayment: BelongsToGetAssociationMixin<DashboardAdvanceRepayment>;

  @Column({
    field: 'payment_reference_id',
    type: STRING(16),
    set: () => null,
  })
  public paymentReferenceId: string;

  @HasMany(() => Payment, { foreignKey: 'referenceId', sourceKey: 'paymentReferenceId' })
  public payments: Payment[];
  public getPayments: () => HasManyGetAssociationsMixin<Payment>;
}
