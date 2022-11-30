import { Moment } from 'moment';
import { moment } from '@dave-inc/time-lib';
import { DATEONLY, DECIMAL, INTEGER, Op, STRING } from 'sequelize';
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
import BankAccount from './bank-account';
import InternalUser from './internal-user';
import AdvanceApprovalClient from '../lib/advance-approval-client';

@Table({ tableName: 'admin_paycheck_override' })
export default class AdminPaycheckOverride extends Model<AdminPaycheckOverride> {
  public static async getNextPaycheckOverrideForAccount(
    bankAccountId: number,
    day: Moment = moment(),
  ) {
    return AdminPaycheckOverride.findOne({
      where: {
        payDate: { [Op.gte]: day.format('YYYY-MM-DD') },
        bankAccountId,
        amount: { [Op.gte]: AdvanceApprovalClient.MINIMUM_PAYCHECK_AMOUNT },
      },
      order: [['payDate', 'ASC']],
    });
  }

  @Column({
    autoIncrement: true,
    primaryKey: true,
    type: INTEGER,
  })
  public id: number;

  @CreatedAt
  public created: Moment;

  @UpdatedAt
  public updated: Moment;

  @ForeignKey(() => User)
  @Column({
    field: 'user_id',
    type: INTEGER,
  })
  public userId: number;

  @BelongsTo(() => User, 'user_id')
  public user: User;

  @ForeignKey(() => InternalUser)
  @Column({
    field: 'creator_id',
    type: INTEGER,
  })
  public creatorId: number;

  @BelongsTo(() => InternalUser, 'creator_id')
  public creator: InternalUser;

  @ForeignKey(() => BankAccount)
  @Column({
    field: 'bank_account_id',
    type: INTEGER,
  })
  public bankAccountId: number;

  @BelongsTo(() => BankAccount)
  public bankAccount: BankAccount;

  @Column({
    type: DECIMAL(16, 2),
  })
  public amount: number;

  @Column({
    type: DATEONLY,
    field: 'pay_date',
  })
  public payDate: Moment;

  @Column({
    type: STRING(8192),
  })
  public note: string;
}
