import { Moment } from 'moment';
import { DATEONLY, STRING, INTEGER, DECIMAL } from 'sequelize';
import { BelongsTo, Column, ForeignKey, Model, Table } from 'sequelize-typescript';

import User from './user';
import BankAccount from './bank-account';
import BankConnection from './bank-connection';

@Table({
  tableName: 'daily_balance_log',
  updatedAt: false,
  createdAt: false,
})
export default class DailyBalanceLog extends Model<DailyBalanceLog> {
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

  @ForeignKey(() => BankAccount)
  @Column({
    field: 'bank_account_id',
    type: INTEGER,
  })
  public bankAccountId: number;

  @BelongsTo(() => BankAccount)
  public bankAccount: BankAccount;

  @ForeignKey(() => BankConnection)
  @Column({
    field: 'bank_connection_id',
    type: INTEGER,
  })
  public bankConnectionId: number;

  @BelongsTo(() => BankConnection)
  public bankConnection: BankConnection;

  @Column({
    type: DECIMAL(16, 2),
  })
  public current: number;

  @Column({
    type: DECIMAL(16, 2),
  })
  public available: number;

  @Column({
    type: STRING(256),
    field: 'plaid_account_id',
  })
  public plaidAccountId: string;

  @Column({
    type: DATEONLY,
  })
  public date: Moment;
}
