import { Moment } from 'moment';
import { DATE, DATEONLY, DECIMAL, ENUM, INTEGER, JSON as SQLJSON, Op, STRING } from 'sequelize';
import {
  BelongsTo,
  Column,
  CreatedAt,
  DeletedAt,
  ForeignKey,
  HasMany,
  Model,
  Scopes,
  Table,
  UpdatedAt,
} from 'sequelize-typescript';
import User from './user';
import { moment } from '@dave-inc/time-lib';
import { RSched } from '../lib/recurring-schedule';
import { RecurringTransactionStatus, TransactionType } from '../typings';
import { isString } from 'lodash';
import { InvalidParametersError } from '../lib/error';
import BankAccount from './bank-account';
import ExpectedTransaction from './expected-transaction';
import { RecurringTransactionInterval, RollDirection } from '@dave-inc/wire-typings';

@Scopes({
  verified: {
    where: {
      status: {
        [Op.notIn]: [
          RecurringTransactionStatus.PENDING_VERIFICATION,
          RecurringTransactionStatus.NOT_VALIDATED,
        ],
      },
      transactionDisplayName: {
        [Op.ne]: null,
      },
    },
  },
  matchable: {
    where: {
      transactionDisplayName: {
        [Op.ne]: null,
      },
    },
  },
})
@Table({
  tableName: 'recurring_transaction',
})
export default class RecurringTransaction extends Model<RecurringTransaction> {
  @CreatedAt
  public created: Moment;

  @UpdatedAt
  public updated: Moment;

  @DeletedAt
  @Column({
    defaultValue: '9999-12-31 23:59:59+00:00',
    type: DATE,
  })
  public deleted: Moment;

  @Column({
    autoIncrement: true,
    primaryKey: true,
    type: INTEGER,
  })
  public id: number;

  @HasMany(() => ExpectedTransaction)
  public expectedTransactions: ExpectedTransaction[];

  @ForeignKey(() => BankAccount)
  @Column({
    field: 'bank_account_id',
    type: INTEGER,
  })
  public bankAccountId: number;
  public getBankAccount: () => Promise<BankAccount>;

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
    type: STRING(512),
    field: 'transaction_display_name',
    defaultValue: null,
  })
  public transactionDisplayName: string;

  @Column({
    field: 'roll_direction',
    type: INTEGER,
    defaultValue: 0,
  })
  public rollDirection: RollDirection;

  @Column({
    type: ENUM('MONTHLY', 'SEMI_MONTHLY', 'BIWEEKLY', 'WEEKLY'),
  })
  public get interval(): RecurringTransactionInterval {
    return this.getDataValue('interval');
  }

  public set interval(value: RecurringTransactionInterval) {
    if (isString(value)) {
      value =
        RecurringTransactionInterval[
          value.toUpperCase() as keyof typeof RecurringTransactionInterval
        ];
    }
    if (!RecurringTransactionInterval[value]) {
      throw new InvalidParametersError(
        'Interval must be one of monthly, weekly, biweekly or semi_monthly',
      );
    }
    this.setDataValue('interval', value.toUpperCase() as RecurringTransactionInterval);
  }

  @Column({
    type: SQLJSON,
  })
  public params: any;

  @Column({
    type: STRING(256),
    field: 'user_display_name',
  })
  public userDisplayName: string;

  @Column({
    type: DECIMAL(10, 0),
    field: 'user_amount',
  })
  public get userAmount(): number {
    return this.getDataValue('userAmount');
  }

  public set userAmount(userAmount: number) {
    this.setDataValue('userAmount', userAmount);
    if (userAmount > 0) {
      this.setDataValue('type', TransactionType.INCOME);
    } else {
      this.setDataValue('type', TransactionType.EXPENSE);
    }
  }

  get rsched(): RSched {
    return RSched.fromRecurringTransaction(this);
  }

  @Column({
    type: DATEONLY,
  })
  public terminated: Moment;

  @Column({
    type: DATEONLY,
    defaultValue: moment().startOf('day'),
  })
  public dtstart: Moment;

  @Column({
    type: STRING(512),
    field: 'pending_display_name',
  })
  public pendingDisplayName: string;

  @Column({
    type: DATE,
    defaultValue: null,
  })
  public missed: Moment;

  @Column({
    type: STRING(512),
    field: 'possible_name_change',
  })
  public possibleNameChange: string;

  @Column({
    type: ENUM('INCOME', 'EXPENSE'),
    defaultValue: TransactionType.EXPENSE,
  })
  public type: TransactionType;

  @Column({
    type: ENUM(...Object.values(RecurringTransactionStatus)),
  })
  public status: RecurringTransactionStatus;
}
