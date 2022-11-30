import { Moment } from 'moment';
import { INTEGER, BelongsToGetAssociationMixin } from 'sequelize';
import {
  BelongsTo,
  Column,
  CreatedAt,
  UpdatedAt,
  ForeignKey,
  Model,
  Table,
} from 'sequelize-typescript';
import { FraudRule, DashboardBulkUpdate } from '.';

@Table({
  tableName: 'dashboard_bulk_update_fraud_rule',
})
export default class DashboardBulkUpdateFraudRule extends Model<DashboardBulkUpdateFraudRule> {
  @ForeignKey(() => DashboardBulkUpdate)
  @Column({
    field: 'dashboard_bulk_update_id',
    type: INTEGER,
    primaryKey: true,
  })
  public dashboardBulkUpdateId: number;

  @BelongsTo(() => DashboardBulkUpdate)
  public dashboardBulkUpdate: DashboardBulkUpdate;
  public getdashboardBulkUpdate: BelongsToGetAssociationMixin<DashboardBulkUpdate>;

  @ForeignKey(() => FraudRule)
  @Column({
    field: 'fraud_rule_id',
    type: INTEGER,
    primaryKey: true,
  })
  public fraudRuleId: number;

  @BelongsTo(() => FraudRule)
  public fraudRule: FraudRule;
  public getFraudRule: BelongsToGetAssociationMixin<FraudRule>;

  @CreatedAt
  public created: Moment;

  @UpdatedAt
  public updated: Moment;
}
