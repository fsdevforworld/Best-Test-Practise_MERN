import { STRING, INTEGER, DATE, DATEONLY, JSON as SQLJSON } from 'sequelize';
import { Column, Model, Table } from 'sequelize-typescript';
import { Moment } from 'moment';

@Table({
  tableName: 'creative_spend_audit',
  updatedAt: false,
})
export default class CreativeSpendAudit extends Model<CreativeSpendAudit> {
  @Column({
    autoIncrement: true,
    primaryKey: true,
    type: INTEGER,
  })
  public id: number;

  @Column({
    field: 'spend_date_pacific_time',
    type: DATEONLY,
  })
  public spendDatePacificTime: Moment;

  @Column({
    type: STRING(256),
  })
  public type: string;

  @Column({
    type: SQLJSON,
  })
  public json: string;

  @Column({
    type: DATE,
  })
  public created: Moment;
}
