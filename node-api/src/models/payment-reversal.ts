import {
  BelongsTo,
  Column,
  CreatedAt,
  ForeignKey,
  Model,
  Scopes,
  Table,
} from 'sequelize-typescript';
import { DECIMAL, ENUM, INTEGER, JSON as SQLJSON, Op, STRING } from 'sequelize';

import { ReversalStatus } from '../typings';

import InternalUser from './internal-user';
import Payment from './payment';

export const completedOrPendingStatuses = [ReversalStatus.Completed, ReversalStatus.Pending];

@Scopes({
  posted: {
    where: {
      status: {
        [Op.or]: completedOrPendingStatuses,
      },
    },
  },
})
@Table({
  tableName: 'payment_reversal',
  updatedAt: false,
})
export default class PaymentReversal extends Model<PaymentReversal> {
  @Column({
    autoIncrement: true,
    primaryKey: true,
    type: INTEGER,
  })
  public id: number;

  @ForeignKey(() => Payment)
  @Column({
    field: 'payment_id',
    type: INTEGER,
  })
  public paymentId: number;

  @BelongsTo(() => Payment)
  public payment: Payment;
  public getPayment: () => Promise<Payment>;

  @Column({
    type: DECIMAL(16, 2),
  })
  public amount: number;

  @Column({
    field: 'status',
    type: ENUM('PENDING', 'COMPLETED', 'FAILED'),
  })
  public status: ReversalStatus;

  @ForeignKey(() => InternalUser)
  @Column({
    field: 'reversed_by_user_id',
    type: INTEGER,
  })
  public reversedByUserId: number;

  @Column({
    type: STRING(5000),
  })
  public note: string;

  @Column({
    type: SQLJSON,
  })
  public extra: any;

  @CreatedAt
  public created: Date;
}
