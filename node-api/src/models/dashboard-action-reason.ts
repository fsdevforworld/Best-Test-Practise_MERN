import { Moment } from '@dave-inc/time-lib';
import { BOOLEAN, INTEGER, STRING } from 'sequelize';
import { HasMany } from 'sequelize-typescript';
import {
  BelongsTo,
  Column,
  CreatedAt,
  ForeignKey,
  Model,
  Scopes,
  Table,
  UpdatedAt,
} from 'sequelize-typescript';
import { DashboardActionLog } from '.';
import DashboardAction from './dashboard-action';

@Scopes(() => ({
  active: {
    where: {
      isActive: true,
    },
  },
  forActionCodes(codes: string[]) {
    return {
      include: [
        {
          model: DashboardAction.scope({ method: ['forCodes', codes] }),
          required: true,
        },
      ],
    };
  },
}))
@Table({
  tableName: 'dashboard_action_reason',
})
export default class DashboardActionReason extends Model<DashboardActionReason> {
  @Column({
    autoIncrement: true,
    primaryKey: true,
    type: INTEGER,
  })
  public id: number;

  @ForeignKey(() => DashboardAction)
  @Column({
    field: 'dashboard_action_id',
    type: INTEGER,
  })
  public dashboardActionId: number;

  @BelongsTo(() => DashboardAction)
  public dashboardAction: DashboardAction;

  @Column({
    type: STRING,
  })
  public reason: string;

  @Column({
    type: BOOLEAN,
    field: 'is_active',
  })
  public isActive: boolean;

  @Column({
    type: BOOLEAN,
    field: 'note_required',
  })
  public noteRequired: boolean;

  @CreatedAt
  public created: Moment;

  @UpdatedAt
  public updated: Moment;

  @HasMany(() => DashboardActionLog)
  public dashboardActionLogs: DashboardActionLog[];
}
