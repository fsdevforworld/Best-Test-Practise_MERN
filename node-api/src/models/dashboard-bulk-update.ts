import { DashboardActionLog } from '.';
import { BelongsToGetAssociationMixin, ENUM, INTEGER, STRING, JSON as SQLJSON } from 'sequelize';
import { Moment } from '@dave-inc/time-lib';
import {
  BelongsTo,
  Column,
  CreatedAt,
  ForeignKey,
  Model,
  Table,
  UpdatedAt,
} from 'sequelize-typescript';

export const statuses = ['CANCELLED', 'COMPLETED', 'FAILED', 'PENDING', 'PROCESSING'] as const;

@Table({
  tableName: 'dashboard_bulk_update',
})
export default class DashboardBulkUpdate extends Model<DashboardBulkUpdate> {
  @Column({
    autoIncrement: true,
    primaryKey: true,
    type: INTEGER,
  })
  public id: number;

  @Column({
    field: 'name',
    type: STRING,
  })
  public name: string;

  @Column({
    field: 'input_file_url',
    type: STRING,
  })
  public inputFileUrl: string;

  @Column({
    field: 'input_file_row_count',
    type: INTEGER,
  })
  public inputFileRowCount: number;

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
    type: STRING,
    field: 'output_file_url',
  })
  public outputFileUrl: string;

  @Column({
    type: ENUM('CANCELLED', 'COMPLETED', 'FAILED', 'PENDING', 'PROCESSING'),
    defaultValue: 'PENDING',
  })
  public status: typeof statuses[number];

  @Column({
    type: SQLJSON,
    defaultValue: () => {
      return {};
    },
  })
  public extra: any;

  @CreatedAt
  public created: Moment;

  @UpdatedAt
  public updated: Moment;
}
