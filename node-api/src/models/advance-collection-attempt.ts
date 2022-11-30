import {
  BelongsTo,
  Column,
  CreatedAt,
  ForeignKey,
  Model,
  Scopes,
  Table,
  UpdatedAt,
} from 'sequelize-typescript';
import { DECIMAL, INTEGER, JSON as SQLJSON, Op, STRING } from 'sequelize';
import { Moment } from '@dave-inc/time-lib';
import Advance from './advance';
import Payment from './payment';
import { ExternalTransactionStatus } from '@dave-inc/wire-typings';

@Scopes({
  active: {
    where: {
      processing: 1,
    },
  },
  /**
   * We conservatively treat Pending payments as successful.
   * If the payment fails later, the collection attempt
   * will no longer be considered successful
   */
  successful: {
    include: [
      {
        model: () => Payment,
        where: {
          status: {
            [Op.in]: [ExternalTransactionStatus.Pending, ExternalTransactionStatus.Completed],
          },
        },
        attributes: [],
      },
    ],
    where: {
      paymentId: { [Op.ne]: null },
    },
  },
})
@Table({ tableName: 'advance_collection_attempt' })
export default class AdvanceCollectionAttempt extends Model<AdvanceCollectionAttempt> {
  @Column({
    autoIncrement: true,
    primaryKey: true,
    type: INTEGER,
  })
  public id: number;

  @ForeignKey(() => Advance)
  @Column({ field: 'advance_id' })
  public advanceId: number;

  @BelongsTo(() => Advance)
  public advance: Advance;

  @ForeignKey(() => Payment)
  @Column({ field: 'payment_id' })
  public paymentId: number;

  @BelongsTo(() => Payment)
  public payment: Payment;

  public setPayment: (payment: Payment) => void;

  public getPayment: () => Promise<Payment>;

  @Column({ type: STRING(256) })
  public trigger: string;

  @Column({
    type: DECIMAL(16, 2),
  })
  public amount: number;

  @Column({
    type: SQLJSON,
  })
  public extra: any;

  @Column
  public processing: boolean;

  @CreatedAt
  public created: Moment;

  @UpdatedAt
  public updated: Moment;

  public successful() {
    return Number.isInteger(this.paymentId);
  }
}
