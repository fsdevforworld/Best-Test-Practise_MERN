import { INTEGER, BelongsToGetAssociationMixin } from 'sequelize';
import { BelongsTo, Column, ForeignKey, Model, Table } from 'sequelize-typescript';
import DeleteRequest from './delete-request';
import DashboardActionLog from './dashboard-action-log';

@Table({
  tableName: 'dashboard_action_log_delete_request',
  timestamps: false,
})
export default class DashboardActionLogDeleteRequest extends Model<
  DashboardActionLogDeleteRequest
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

  @ForeignKey(() => DeleteRequest)
  @Column({
    field: 'delete_request_id',
    type: INTEGER,
    primaryKey: true,
  })
  public deleteRequestId: number;

  @BelongsTo(() => DeleteRequest)
  public deleteRequest: DeleteRequest;
}
