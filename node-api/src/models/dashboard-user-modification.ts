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

import { IDashboardModification as Modification, IDashboardBaseModification } from '../typings';
import DashboardActionLog from './dashboard-action-log';
import User from './user';

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
  tableName: 'dashboard_user_modification',
  updatedAt: false,
})
export default class DashboardUserModification extends Model<DashboardUserModification>
  implements IDashboardBaseModification {
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

  public getModifiedEntityType = () => 'user';
  public getModifiedEntityId = () => this.userId;
}
