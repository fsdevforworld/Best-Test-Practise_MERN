import { Moment } from 'moment';
import { BIGINT, BOOLEAN, DATE, DECIMAL, FindOptions, INTEGER, JSON as SQLJSON } from 'sequelize';
import {
  BelongsTo,
  Column,
  CreatedAt,
  DeletedAt,
  ForeignKey,
  Model,
  Table,
  UpdatedAt,
} from 'sequelize-typescript';

import AdvanceApproval from './advance-approval';

@Table({
  tableName: 'advance_payback_date_prediction',
})
export default class AdvancePaybackDatePrediction extends Model<AdvancePaybackDatePrediction> {
  @Column({
    autoIncrement: true,
    primaryKey: true,
    type: BIGINT,
  })
  public id: number;

  @CreatedAt
  public created: Moment;

  @UpdatedAt
  public updated: Moment;

  @DeletedAt
  public deleted: Moment;

  @ForeignKey(() => AdvanceApproval)
  @Column({
    field: 'advance_approval_id',
    type: INTEGER,
  })
  public advanceApprovalId: number;

  @BelongsTo(() => AdvanceApproval, 'advance_approval_id')
  public advanceApproval: AdvanceApproval;
  public getAdvanceApproval: (options?: FindOptions) => Promise<AdvanceApproval>;

  @Column({
    type: DATE,
    field: 'predicted_date',
  })
  public predictedDate: Moment;

  @Column({
    type: DECIMAL,
    field: 'score',
  })
  public score: number;

  @Column({
    type: BOOLEAN,
    field: 'success',
  })
  public success: boolean;

  @Column({
    type: SQLJSON,
    field: 'extra',
  })
  public extra?: { [key: string]: any };
}
