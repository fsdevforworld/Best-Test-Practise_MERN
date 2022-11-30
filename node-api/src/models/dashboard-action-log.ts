import { Moment } from '@dave-inc/time-lib';
import { STRING, TEXT, INTEGER, BelongsToGetAssociationMixin } from 'sequelize';
import {
  Column,
  Model,
  Table,
  CreatedAt,
  ForeignKey,
  BelongsTo,
  Scopes,
  HasOne,
} from 'sequelize-typescript';
import { DashboardUserModification } from '.';

import DashboardAction from './dashboard-action';
import DashboardActionReason from './dashboard-action-reason';
import InternalUser from './internal-user';

@Scopes(() => ({
  withRelated: {
    include: [
      {
        model: DashboardActionReason,
        include: [DashboardAction],
      },
      InternalUser,
    ],
  },
  forActionCodes(actionCodes: string[]) {
    return {
      include: [
        {
          model: DashboardActionReason.scope({ method: ['forActionCodes', actionCodes] }),
          required: true,
        },
        InternalUser,
      ],
    };
  },
}))
@Table({
  tableName: 'dashboard_action_log',
  updatedAt: false,
})
export default class DashboardActionLog extends Model<DashboardActionLog> {
  @Column({
    autoIncrement: true,
    primaryKey: true,
    type: INTEGER,
  })
  public id: number;

  @ForeignKey(() => DashboardActionReason)
  @Column({
    field: 'dashboard_action_reason_id',
    type: INTEGER,
  })
  public dashboardActionReasonId: number;

  @BelongsTo(() => DashboardActionReason)
  public dashboardActionReason: DashboardActionReason;
  public getDashboardActionReason: BelongsToGetAssociationMixin<DashboardActionReason>;

  @ForeignKey(() => InternalUser)
  @Column({
    field: 'internal_user_id',
    type: INTEGER,
  })
  public internalUserId: number;

  @BelongsTo(() => InternalUser)
  public internalUser: InternalUser;
  public getInternalUser: BelongsToGetAssociationMixin<InternalUser>;

  @Column({
    field: 'note',
    type: TEXT,
  })
  public note: string;

  @Column({
    field: 'zendesk_ticket_url',
    type: STRING,
  })
  public zendeskTicketUrl: string;

  @CreatedAt
  public created: Moment;

  @HasOne(() => DashboardUserModification)
  public dashboardUserModification: DashboardUserModification;
}
