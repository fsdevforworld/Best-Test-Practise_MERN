import { Moment } from 'moment';
import { BIGINT, DATE, DATEONLY, DECIMAL, ENUM, INTEGER, JSON as SQLJSON, STRING } from 'sequelize';
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
import { serializeDate } from '../serialization';
import BankAccount from './bank-account';
import User from './user';
import BankTransaction from './bank-transaction';
import { TransactionType, ISerializable } from '../typings';
import RecurringTransaction from './recurring-transaction';
import { ExpectedTransactionResponse } from '@dave-inc/wire-typings';

export enum ExpectedTransactionStatus {
  PREDICTED = 'PREDICTED',
  PENDING = 'PENDING',
  SETTLED = 'SETTLED',
}

@Table({
  tableName: 'expected_transaction',
  paranoid: true,
})
export default class ExpectedTransaction extends Model<ExpectedTransaction>
  implements ISerializable<ExpectedTransactionResponse> {
  @Column({
    autoIncrement: true,
    primaryKey: true,
    type: INTEGER,
  })
  public id: number;

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

  @ForeignKey(() => RecurringTransaction)
  @Column({
    type: INTEGER,
    field: 'recurring_transaction_id',
  })
  public recurringTransactionId: number;

  @BelongsTo(() => RecurringTransaction)
  public recurringTransaction: RecurringTransaction; // dont include a getter because we want to reduce dependency on sequelize

  @ForeignKey(() => BankTransaction)
  @Column({
    type: BIGINT,
    field: 'bank_transaction_id',
  })
  public bankTransactionId: BigInt;

  public get type(): TransactionType {
    return this.expectedAmount > 0 ? TransactionType.INCOME : TransactionType.EXPENSE;
  }

  @Column({
    type: STRING(512),
    field: 'display_name',
  })
  public displayName: string;

  @Column({
    type: STRING(512),
    field: 'pending_display_name',
  })
  public pendingDisplayName: string;

  @Column({
    type: DECIMAL(16, 2),
    field: 'expected_amount',
  })
  public expectedAmount: number;

  @Column({
    type: DECIMAL(16, 2),
    field: 'pending_amount',
  })
  public pendingAmount: number;

  @Column({
    type: DECIMAL(16, 2),
    field: 'settled_amount',
  })
  public settledAmount: number;

  @Column({
    type: DATEONLY,
    field: 'expected_date',
  })
  public expectedDate: Moment;

  @Column({
    type: DATEONLY,
    field: 'pending_date',
  })
  public pendingDate: Moment;

  @Column({
    type: DATEONLY,
    field: 'settled_date',
  })
  public settledDate: Moment;

  @Column({
    type: SQLJSON,
    defaultValue: {},
  })
  public extra: any;

  @CreatedAt
  public created: Date;

  @UpdatedAt
  public updated: Date;

  @DeletedAt
  @Column({
    type: DATE,
  })
  public deleted: Date;

  @Column({
    type: ENUM('PREDICTED', 'PENDING', 'SETTLED'),
    field: 'status',
    defaultValue: 'PREDICTED',
  })
  public get status(): ExpectedTransactionStatus {
    return this.getDataValue('status')
      .toString()
      .toUpperCase() as ExpectedTransactionStatus;
  }

  public set status(value: ExpectedTransactionStatus) {
    this.setDataValue('status', value);
  }

  public serialize(): ExpectedTransactionResponse {
    return {
      id: this.id,
      bankAccountId: this.bankAccountId,
      userId: this.userId,
      recurringTransactionId: this.recurringTransactionId,
      displayName: this.displayName,
      pendingDisplayName: this.pendingDisplayName,
      expectedAmount: this.expectedAmount,
      settledAmount: this.settledAmount,
      extra: this.extra,
      status: this.status,
      expectedDate: serializeDate(this.expectedDate, 'YYYY-MM-DD'),
      deleted: serializeDate(this.deleted),
      pendingDate: serializeDate(this.pendingDate),
      created: serializeDate(this.created),
      updated: serializeDate(this.updated),
    };
  }
}
