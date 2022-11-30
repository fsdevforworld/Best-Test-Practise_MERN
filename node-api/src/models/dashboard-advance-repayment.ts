import { Moment } from '@dave-inc/time-lib';
import {
  BelongsToGetAssociationMixin,
  DECIMAL,
  ENUM,
  HasManyGetAssociationsMixin,
  INTEGER,
  STRING,
} from 'sequelize';
import {
  Column,
  Model,
  Table,
  CreatedAt,
  ForeignKey,
  BelongsTo,
  Scopes,
  UpdatedAt,
  HasMany,
} from 'sequelize-typescript';

import Advance from './advance';
import DashboardActionLog from './dashboard-action-log';
import DashboardPayment from './dashboard-payment';

const statuses = ['PENDING', 'SUCCEEDED', 'FAILED'] as const;
const terminalStatuses = ['SUCCEEDED', 'FAILED'] as const;

function isTerminalStatus(
  status: typeof statuses[number],
): status is typeof terminalStatuses[number] {
  return (terminalStatuses as readonly string[]).includes(status);
}

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
  tableName: 'dashboard_advance_repayment',
})
class DashboardAdvanceRepayment extends Model<DashboardAdvanceRepayment> {
  @Column({
    type: STRING(256),
    field: 'tivan_task_id',
    primaryKey: true,
  })
  public tivanTaskId: string;

  @ForeignKey(() => DashboardActionLog)
  @Column({
    field: 'dashboard_action_log_id',
    type: INTEGER,
  })
  public dashboardActionLogId: number;

  @BelongsTo(() => DashboardActionLog)
  public dashboardActionLog: DashboardActionLog;
  public getDashboardActionLog: BelongsToGetAssociationMixin<DashboardActionLog>;

  @ForeignKey(() => Advance)
  @Column({
    field: 'advance_id',
    type: INTEGER,
  })
  public advanceId: number;

  @BelongsTo(() => Advance)
  public advance: Advance;
  public getAdvance: BelongsToGetAssociationMixin<Advance>;

  @Column({
    type: ENUM(...statuses),
    field: 'status',
  })
  public status: typeof statuses[number];

  @Column({
    type: DECIMAL(16, 2),
  })
  public amount: number;

  @Column({
    type: STRING(256),
    field: 'payment_method_universal_id',
  })
  public paymentMethodUniversalId: string;

  @HasMany(() => DashboardPayment)
  public dashboardPayments: DashboardPayment[];
  public getDashboardPayments: HasManyGetAssociationsMixin<DashboardPayment>;

  @CreatedAt
  public created: Moment;

  @UpdatedAt
  public updated: Moment;
}

export { isTerminalStatus, statuses, terminalStatuses };
export default DashboardAdvanceRepayment;
