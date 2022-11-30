import { INTEGER, STRING, BelongsToGetAssociationMixin } from 'sequelize';
import { BelongsTo, Column, ForeignKey, Model, Table, Scopes } from 'sequelize-typescript';
import DashboardActionLog from './dashboard-action-log';

@Scopes(() => ({
  withActionLog: {
    include: [
      {
        model: DashboardActionLog.scope('withRelated'),
      },
    ],
  },
}))
@Table({
  tableName: 'dashboard_action_log_monthly_statement',
  timestamps: false,
})
export default class DashboardActionLogMonthlyStatement extends Model<
  DashboardActionLogMonthlyStatement
> {
  @ForeignKey(() => DashboardActionLog)
  @Column({
    field: 'dashboard_action_log_id',
    type: INTEGER,
    primaryKey: true,
  })
  public dashboardActionLogId: number;

  @BelongsTo(() => DashboardActionLog)
  public dashboardActionLog: DashboardActionLog;
  public getDashboardActionLog: BelongsToGetAssociationMixin<DashboardActionLog>;

  @Column({
    field: 'statement_id',
    type: STRING,
    primaryKey: true,
  })
  public statementId: number;
}
