import { Moment } from 'moment';
import { BOOLEAN, FindOptions, INTEGER, JSON as SQLJSON, STRING } from 'sequelize';
import {
  BelongsTo,
  Column,
  CreatedAt,
  ForeignKey,
  Model,
  Table,
  UpdatedAt,
} from 'sequelize-typescript';

import AdvanceApproval from './advance-approval';
import { AdvanceApprovalCreateResponse } from '../services/advance-approval/types';

@Table({
  tableName: 'advance_node_log',
  updatedAt: false,
})
export default class AdvanceNodeLog extends Model<AdvanceNodeLog> {
  @Column({
    autoIncrement: true,
    primaryKey: true,
    type: INTEGER,
  })
  public id: number;

  @ForeignKey(() => AdvanceApproval)
  @Column({
    field: 'advance_approval_id',
    type: INTEGER,
  })
  public advanceApprovalId: number;

  @BelongsTo(() => AdvanceApproval)
  public advanceApproval: AdvanceApproval;

  public getAdvanceApproval: (options?: FindOptions) => PromiseLike<AdvanceApproval>;

  @Column({
    type: BOOLEAN,
    field: 'success',
  })
  public success: boolean;

  @Column({
    type: STRING,
  })
  public name: string;

  @Column({
    field: 'success_node_name',
    type: STRING,
  })
  public successNodeName: string;

  @Column({
    field: 'failure_node_name',
    type: STRING,
  })
  public failureNodeName: string;

  @Column({
    field: 'approval_response',
    type: SQLJSON,
  })
  public approvalResponse: AdvanceNodeLogApprovalResponse;

  @CreatedAt
  public created: Moment;

  @UpdatedAt
  public updated: Moment;
}

export type AdvanceNodeLogApprovalResponse = {
  updates: Partial<AdvanceApprovalCreateResponse>;
  isMl: boolean;
  isExperimental: boolean;
};
