import { Moment } from '@dave-inc/time-lib';
import { BelongsToGetAssociationMixin, INTEGER, STRING } from 'sequelize';
import {
  BelongsTo,
  Column,
  CreatedAt,
  DeletedAt,
  ForeignKey,
  Model,
  Scopes,
  Table,
  UpdatedAt,
} from 'sequelize-typescript';

import DashboardActionLog from './dashboard-action-log';
import DashboardNotePriority from './dashboard-note-priority';
import User from './user';

@Scopes(() => ({
  withRelated: {
    include: [
      {
        model: DashboardActionLog.scope('withRelated'),
      },
      {
        model: DashboardNotePriority,
      },
    ],
  },
}))
@Table({
  tableName: 'dashboard_user_note',
  paranoid: true,
})
export default class DashboardUserNote extends Model<DashboardUserNote> {
  @Column({
    autoIncrement: true,
    primaryKey: true,
    type: INTEGER,
  })
  public id: number;

  @ForeignKey(() => User)
  @Column({
    field: 'user_id',
    type: INTEGER,
  })
  public userId: number;

  @BelongsTo(() => User)
  public user: User;
  public getUser: BelongsToGetAssociationMixin<User>;

  @ForeignKey(() => DashboardActionLog)
  @Column({
    field: 'dashboard_action_log_id',
    type: INTEGER,
  })
  public dashboardActionLogId: number;

  @BelongsTo(() => DashboardActionLog)
  public dashboardActionLog: DashboardActionLog;
  public getDashboardActionLog: BelongsToGetAssociationMixin<DashboardActionLog>;

  @ForeignKey(() => DashboardNotePriority)
  @Column({
    field: 'dashboard_note_priority_code',
    type: STRING,
  })
  public dashboardNotePriorityCode: string;

  @BelongsTo(() => DashboardNotePriority)
  public dashboardNotePriority: DashboardNotePriority;
  public getDashboardNotePriority: BelongsToGetAssociationMixin<DashboardNotePriority>;

  @CreatedAt
  public created: Moment;

  @UpdatedAt
  public updated: Moment;

  @DeletedAt
  public deleted: Moment;
}
