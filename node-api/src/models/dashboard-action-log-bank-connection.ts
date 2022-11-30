import { INTEGER, BelongsToGetAssociationMixin } from 'sequelize';
import { BelongsTo, Column, ForeignKey, Model, Table } from 'sequelize-typescript';
import BankConnection from './bank-connection';
import DashboardActionLog from './dashboard-action-log';

@Table({
  tableName: 'dashboard_action_log_bank_connection',
  timestamps: false,
})
export default class DashboardActionLogBankConnection extends Model<
  DashboardActionLogBankConnection
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

  @ForeignKey(() => BankConnection)
  @Column({
    field: 'bank_connection_id',
    type: INTEGER,
    primaryKey: true,
  })
  public bankConnectionId: number;

  @BelongsTo(() => BankConnection)
  public bankConnection: BankConnection;
}
