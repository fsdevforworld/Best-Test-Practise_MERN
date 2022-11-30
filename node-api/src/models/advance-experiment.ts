import { Moment } from 'moment';
import { DATE, INTEGER, STRING, TEXT } from 'sequelize';
import { Column, CreatedAt, Model, Table, UpdatedAt } from 'sequelize-typescript';

@Table({
  tableName: 'advance_experiment',
  updatedAt: false,
})
export default class AdvanceExperiment extends Model<AdvanceExperiment> {
  @Column({
    autoIncrement: true,
    primaryKey: true,
    type: INTEGER,
  })
  public id: number;

  @Column({
    type: STRING,
  })
  public name: string;

  @Column({
    type: INTEGER,
  })
  public version: number;

  @Column({
    field: 'start_date',
    type: DATE,
  })
  public startDate: Moment;

  @Column({
    field: 'end_date',
    type: DATE,
  })
  public endDate: Moment;

  @Column({
    type: TEXT,
  })
  public notes: string;

  @Column({
    type: TEXT,
  })
  public description: string;

  @CreatedAt
  public created: Moment;

  @UpdatedAt
  public updated: Moment;
}
