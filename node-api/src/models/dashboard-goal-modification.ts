import { Moment } from '@dave-inc/time-lib';
import { BelongsToGetAssociationMixin, INTEGER, JSON as SQLJSON, STRING } from 'sequelize';
import {
  Column,
  Model,
  Table,
  CreatedAt,
  ForeignKey,
  BelongsTo,
  Scopes,
} from 'sequelize-typescript';

import { IDashboardBaseModification, IDashboardModification as Modification } from '../typings';
import DashboardActionLog from './dashboard-action-log';

@Scopes(() => ({
  withDashboardAction: {
    include: [DashboardActionLog.scope('withRelated')],
  },
  forActionCodes(actionCodes: string[]) {
    return {
      include: [
        {
          model: DashboardActionLog.scope([{ method: ['forActionCodes', actionCodes] }]),
          required: true,
        },
      ],
    };
  },
}))
@Table({
  tableName: 'dashboard_goal_modification',
})
export default class DashboardGoalModification extends Model<DashboardGoalModification>
  implements IDashboardBaseModification {
  @Column({
    autoIncrement: true,
    primaryKey: true,
    type: INTEGER,
  })
  public id: number;

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
    field: 'goal_id',
    type: STRING,
  })
  public goalId: string;

  @Column({
    field: 'modification',
    type: SQLJSON,
  })
  public modification: Modification;

  @CreatedAt
  public created: Moment;

  public getModifiedEntityType = () => 'goal';
  public getModifiedEntityId = () => this.goalId;
}
