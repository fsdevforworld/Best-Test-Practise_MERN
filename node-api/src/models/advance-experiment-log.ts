import { Moment } from '@dave-inc/time-lib';
import { BOOLEAN, DECIMAL, FindOptions, INTEGER, JSON as SQLJSON } from 'sequelize';
import {
  BelongsTo,
  Column,
  CreatedAt,
  ForeignKey,
  Model,
  Table,
  UpdatedAt,
} from 'sequelize-typescript';

import User from './user';
import Advance from './advance';
import AdvanceExperiment from './advance-experiment';
import BankAccount from './bank-account';
import AdvanceApproval from './advance-approval';

@Table({
  tableName: 'advance_experiment_log',
  updatedAt: false,
})
export default class AdvanceExperimentLog extends Model<AdvanceExperimentLog> {
  @Column({
    autoIncrement: true,
    primaryKey: true,
    type: INTEGER,
  })
  public id: number;

  @ForeignKey(() => User)
  @Column({
    field: 'user_id',
    type: INTEGER,
  })
  public userId: number;

  @BelongsTo(() => User)
  public user: User;

  public getUser: (options?: FindOptions) => PromiseLike<User>;

  @ForeignKey(() => BankAccount)
  @Column({
    field: 'bank_account_id',
    type: INTEGER,
  })
  public bankAccountId: number;

  @BelongsTo(() => BankAccount)
  public bankAccount: BankAccount;

  public getBankAccount: (options?: FindOptions) => PromiseLike<BankAccount>;

  @ForeignKey(() => Advance)
  @Column({
    field: 'advance_id',
    type: INTEGER,
  })
  public advanceId: number;

  @BelongsTo(() => Advance)
  public advance: Advance;

  public getAdvance: (options?: FindOptions) => PromiseLike<Advance>;

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

  @ForeignKey(() => AdvanceExperiment)
  @Column({
    field: 'advance_experiment_id',
    type: INTEGER,
  })
  public advanceExperimentId: number;

  @BelongsTo(() => AdvanceExperiment)
  public experiment: AdvanceExperiment;

  public getAdvanceExperiment: (options?: FindOptions) => PromiseLike<AdvanceExperiment>;

  @Column({
    type: DECIMAL(15, 10),
    field: 'experiment_value',
  })
  public experimentValue: number;

  @Column({
    type: BOOLEAN,
    field: 'is_ml',
  })
  public isMl: boolean;

  @Column({
    type: SQLJSON,
  })
  public extra: any;

  @CreatedAt
  public created: Moment;

  @UpdatedAt
  public updated: Moment;
}
