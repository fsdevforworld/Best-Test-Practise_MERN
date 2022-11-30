import { INTEGER, BelongsToGetAssociationMixin } from 'sequelize';
import { BelongsTo, Column, ForeignKey, Model, Table } from 'sequelize-typescript';
import MembershipPause from './membership-pause';
import DashboardActionLog from './dashboard-action-log';

@Table({
  tableName: 'dashboard_action_log_membership_pause',
  timestamps: false,
})
export default class DashboardActionLogMembershipPause extends Model<
  DashboardActionLogMembershipPause
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

  @ForeignKey(() => MembershipPause)
  @Column({
    field: 'membership_pause_id',
    type: INTEGER,
    primaryKey: true,
  })
  public membershipPauseId: number;

  @BelongsTo(() => MembershipPause)
  public membershipPause: MembershipPause;
}
