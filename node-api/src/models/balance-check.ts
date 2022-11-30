import { Moment } from 'moment';
import { BOOLEAN, ENUM, INTEGER, JSON as SQLJSON } from 'sequelize';
import {
  BeforeCreate,
  BelongsTo,
  Column,
  CreatedAt,
  ForeignKey,
  Model,
  Table,
  UpdatedAt,
} from 'sequelize-typescript';
import BankConnection from './bank-connection';
import { BalanceCheckTrigger } from '../typings';
import Advance from './advance';

@Table({
  tableName: 'plaid_balance_check',
})
export default class BalanceCheck extends Model<BalanceCheck> {
  @BeforeCreate
  public static transformToExtra(model: BalanceCheck, options: any) {
    if (model.extra instanceof Error) {
      model.extra = Object.getOwnPropertyNames(model.extra).reduce((acc, key) => {
        acc[key] = model.extra[key];
        return acc;
      }, {} as Record<string, any>);
    }
  }

  @Column({
    autoIncrement: true,
    primaryKey: true,
    type: INTEGER,
  })
  public id: number;

  @ForeignKey(() => BankConnection)
  @Column({
    field: 'bank_connection_id',
    type: INTEGER,
  })
  public bankConnectionId: number;

  @ForeignKey(() => Advance)
  @Column({
    field: 'advance_id',
    type: INTEGER,
  })
  public advanceId: number;

  @BelongsTo(() => BankConnection)
  public bankConnection: BankConnection;

  @Column({
    type: BOOLEAN,
  })
  public successful: boolean;

  @Column({
    type: ENUM(
      'USER_REFRESH',
      'ADVANCE_COLLECTION',
      'SUBSCRIPTION_COLLECTION',
      'ADVANCE_APPROVAL',
      'DEBIT_MICRO_DEPOSIT',
    ),
  })
  public trigger: BalanceCheckTrigger;

  @Column({
    type: INTEGER,
    field: 'response_time',
  })
  public responseTime: number;

  @Column({
    type: SQLJSON,
  })
  public extra: any;

  @CreatedAt
  public created: Moment;

  @UpdatedAt
  public updated: Moment;
}
