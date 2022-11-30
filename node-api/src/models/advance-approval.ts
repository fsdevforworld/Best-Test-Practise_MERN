import { Moment } from 'moment';
import {
  BelongsToGetAssociationMixin,
  BOOLEAN,
  DATE,
  DATEONLY,
  INTEGER,
  JSON as SQLJSON,
  STRING,
} from 'sequelize';
import {
  BelongsTo,
  BelongsToMany,
  Column,
  CreatedAt,
  ForeignKey,
  HasOne,
  Model,
  Table,
  UpdatedAt,
} from 'sequelize-typescript';
import User from './user';
import AdvanceExperiment from './advance-experiment';
import AdvanceExperimentLog from './advance-experiment-log';
import BankAccount from './bank-account';
import DashboardAdvanceApproval from './dashboard-advance-approval';
import RecurringTransaction from './recurring-transaction';
import { EngineEvent, AdvanceRequestAuditLogExtra } from '../services/advance-approval/types';

@Table({
  tableName: 'advance_approval',
})
export default class AdvanceApproval extends Model<AdvanceApproval> {
  @CreatedAt
  public created: Moment;

  @UpdatedAt
  public updated: Moment;

  @Column({
    autoIncrement: true,
    primaryKey: true,
    type: INTEGER,
  })
  public id: number;

  @BelongsToMany(
    () => AdvanceExperiment,
    () => AdvanceExperimentLog,
    'advance_approval_id',
  )
  public experiments: AdvanceExperiment[];

  @ForeignKey(() => BankAccount)
  @Column({
    field: 'bank_account_id',
    type: INTEGER,
  })
  public bankAccountId: number;

  @BelongsTo(() => BankAccount)
  public bankAccount: BankAccount;

  @ForeignKey(() => User)
  @Column({
    field: 'user_id',
    type: INTEGER,
  })
  public userId: number;

  @BelongsTo(() => User)
  public user: User;

  @Column({
    type: BOOLEAN,
    field: 'normal_advance_approved',
    defaultValue: false,
  })
  public normalAdvanceApproved: boolean;

  @Column({
    type: BOOLEAN,
    field: 'micro_advance_approved',
    defaultValue: false,
  })
  public microAdvanceApproved: boolean;

  @Column({
    type: BOOLEAN,
    defaultValue: false,
  })
  public approved: boolean;

  @Column({
    field: 'approved_amounts',
    type: SQLJSON,
    defaultValue: [],
  })
  public approvedAmounts: number[];

  @Column({
    type: SQLJSON,
    field: 'rejection_reasons',
  })
  public rejectionReasons: EngineEvent[];

  @Column({
    type: STRING(256),
    field: 'primary_rejection_reason',
  })
  public primaryRejectionReason: string;

  @Column({
    field: 'extra',
    type: SQLJSON,
    defaultValue: {},
  })
  public extra: AdvanceRequestAuditLogExtra;

  @Column({
    field: 'is_preferred',
    type: BOOLEAN,
    defaultValue: 0,
  })
  public isPreferred: boolean;

  @Column({
    field: 'grouped_at',
    type: DATE,
  })
  public groupedAt?: Moment;

  // Together with the user_id and grouped_at columns, this value
  // identifies which other AdvanceApprovals were generated at the same
  // time as this one. Useful for data analysis.
  @Column({
    field: 'group_token',
    type: STRING(8),
  })
  public groupToken?: string;

  @Column({
    field: 'default_payback_date',
    type: DATEONLY,
  })
  public defaultPaybackDate?: Moment;

  @Column({
    field: 'expected_transaction_id',
    type: INTEGER,
  })
  public expectedTransactionId?: string;

  @ForeignKey(() => RecurringTransaction)
  @Column({
    field: 'recurring_transaction_id',
    type: INTEGER,
  })
  public recurringTransactionId?: number;
  @BelongsTo(() => RecurringTransaction)
  public recurringTransaction?: RecurringTransaction;
  public getRecurringTransaction: BelongsToGetAssociationMixin<RecurringTransaction>;

  @Column({
    field: 'ext_recurring_transaction_uuid',
    type: STRING,
  })
  public recurringTransactionUuid?: string;

  @Column({
    field: 'ext_expected_transaction_uuid',
    type: STRING,
  })
  public expectedTransactionUuid?: string;

  @HasOne(() => DashboardAdvanceApproval)
  public dashboardAdvanceApproval: DashboardAdvanceApproval;
  public getDashboardAdvanceApproval: () => Promise<DashboardAdvanceApproval>;
}
