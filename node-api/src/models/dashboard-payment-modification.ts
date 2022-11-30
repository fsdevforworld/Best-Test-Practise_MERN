import { Moment } from '@dave-inc/time-lib';
import { BelongsToGetAssociationMixin, INTEGER, JSON as SQLJSON } from 'sequelize';
import {
  Column,
  Model,
  Table,
  CreatedAt,
  ForeignKey,
  BelongsTo,
  Scopes,
} from 'sequelize-typescript';

import DashboardActionLog from './dashboard-action-log';
import Payment from './payment';

import { IDashboardModification as Modification, IDashboardBaseModification } from '../typings';

@Scopes(() => ({
  withDashboardAction: {
    include: [
      {
        model: DashboardActionLog.scope('withRelated'),
      },
    ],
  },
  forAdvanceId: (advanceId: number) => ({
    include: [{ model: Payment, where: { advanceId }, paranoid: false }],
  }),
}))
@Table({
  tableName: 'dashboard_payment_modification',
  updatedAt: false,
})
export default class DashboardPaymentModification extends Model<DashboardPaymentModification>
  implements IDashboardBaseModification {
  @Column({
    autoIncrement: true,
    primaryKey: true,
    type: INTEGER,
  })
  public id: number;

  @ForeignKey(() => Payment)
  @Column({
    field: 'payment_id',
    type: INTEGER,
  })
  public paymentId: number;

  @BelongsTo(() => Payment)
  public payment: Payment;

  @ForeignKey(() => DashboardActionLog)
  @Column({
    field: 'dashboard_action_log_id',
    type: INTEGER,
  })
  public dashboardActionLogId: number;

  @BelongsTo(() => DashboardActionLog)
  public dashboardActionLog: DashboardActionLog;
  public getDashboardActionLog: BelongsToGetAssociationMixin<DashboardActionLog>;

  @Column({
    field: 'modification',
    type: SQLJSON,
  })
  public modification: Modification;

  @CreatedAt
  public created: Moment;

  public getModifiedEntityType = () => 'payment';
  public getModifiedEntityId = () => this.paymentId;
}
