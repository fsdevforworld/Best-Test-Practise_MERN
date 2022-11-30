import { Moment } from '@dave-inc/time-lib';
import { INTEGER, STRING } from 'sequelize';
import { Column, CreatedAt, HasMany, Model, Table, UpdatedAt, Scopes } from 'sequelize-typescript';
import DashboardActionReason from './dashboard-action-reason';

@Scopes(() => ({
  withReasons: {
    include: [DashboardActionReason],
  },
  forCodes(codes: string[]) {
    return {
      where: { code: codes },
    };
  },
}))
@Table({
  tableName: 'dashboard_action',
})
export default class DashboardAction extends Model<DashboardAction> {
  @Column({
    autoIncrement: true,
    primaryKey: true,
    type: INTEGER,
  })
  public id: number;

  @Column({
    type: STRING,
  })
  public code: string;

  @Column({
    type: STRING,
  })
  public name: string;

  @CreatedAt
  public created: Moment;

  @UpdatedAt
  public updated: Moment;

  @HasMany(() => DashboardActionReason)
  public dashboardActionReasons: DashboardActionReason[];
}
