import { Moment } from '@dave-inc/time-lib';
import { BelongsToGetAssociationMixin, INTEGER, JSON as SQLJSON } from 'sequelize';
import {
  BelongsTo,
  Column,
  CreatedAt,
  ForeignKey,
  Model,
  Scopes,
  Table,
} from 'sequelize-typescript';

import DashboardAction from './dashboard-action';
import DashboardActionLog from './dashboard-action-log';
import DashboardActionReason from './dashboard-action-reason';
import SubscriptionBilling from './subscription-billing';

import { IDashboardModification as Modification, IDashboardBaseModification } from '../typings';

@Scopes(() => ({
  withActionCode(code: string) {
    return {
      where: {
        '$dashboardActionLog.dashboardActionReason.dashboardAction.code$': code,
      },
      include: [
        {
          model: DashboardActionLog,
          include: [{ model: DashboardActionReason, include: [DashboardAction] }],
        },
      ],
    };
  },
}))
@Table({
  tableName: 'dashboard_subscription_billing_modification',
  updatedAt: false,
})
export default class DashboardSubscriptionBillingModification
  extends Model<DashboardSubscriptionBillingModification>
  implements IDashboardBaseModification {
  @Column({
    autoIncrement: true,
    primaryKey: true,
    type: INTEGER,
  })
  public id: number;

  @ForeignKey(() => SubscriptionBilling)
  @Column({
    field: 'subscription_billing_id',
    type: INTEGER,
  })
  public subscriptionBillingId: number;

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

  public getModifiedEntityType = () => 'subscription-billing';
  public getModifiedEntityId = () => this.subscriptionBillingId;
}
