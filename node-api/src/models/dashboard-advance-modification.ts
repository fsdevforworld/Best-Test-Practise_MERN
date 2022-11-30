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
import Advance from './advance';

import { IDashboardModification as Modification, IDashboardBaseModification } from '../typings';

@Scopes(() => ({
  withDashboardAction: {
    include: [
      {
        model: DashboardActionLog.scope('withRelated'),
      },
    ],
  },
}))
@Table({
  tableName: 'dashboard_advance_modification',
  updatedAt: false,
})
export default class DashboardAdvanceModification extends Model<DashboardAdvanceModification>
  implements IDashboardBaseModification {
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

  public getModifiedEntityType = () => 'advance';
  public getModifiedEntityId = () => this.advanceId;
}
