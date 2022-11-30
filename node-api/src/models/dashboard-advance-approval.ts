import { INTEGER } from 'sequelize';
import { BelongsTo, Column, ForeignKey, Model, Table } from 'sequelize-typescript';
import { AdvanceApproval, DashboardActionLog } from './index';

@Table({
  tableName: 'dashboard_advance_approval',
  timestamps: false,
})
export default class DashboardAdvanceApproval extends Model<DashboardAdvanceApproval> {
  @ForeignKey(() => DashboardActionLog)
  @Column({
    field: 'dashboard_action_log_id',
    type: INTEGER,
    primaryKey: true,
  })
  public dashboardActionLogId: number;

  @BelongsTo(() => DashboardActionLog)
  public dashboardActionLog: DashboardActionLog;

  @ForeignKey(() => AdvanceApproval)
  @Column({
    field: 'advance_approval_id',
    type: INTEGER,
    primaryKey: true,
  })
  public advanceApprovalId: number;

  @BelongsTo(() => AdvanceApproval)
  public advanceApproval: AdvanceApproval;
}
