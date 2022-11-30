import { Moment } from '@dave-inc/time-lib';
import { INTEGER, STRING } from 'sequelize';
import { Column, CreatedAt, Model, Table, UpdatedAt } from 'sequelize-typescript';

@Table({
  tableName: 'dashboard_note_priority',
})
export default class DashboardNotePriority extends Model<DashboardNotePriority> {
  @Column({
    primaryKey: true,
    type: STRING,
  })
  public code: string;

  @Column({
    type: INTEGER,
  })
  public ranking: number;

  @Column({
    type: STRING,
    field: 'display_name',
  })
  public displayName: string;

  @CreatedAt
  public created: Moment;

  @UpdatedAt
  public updated: Moment;
}
