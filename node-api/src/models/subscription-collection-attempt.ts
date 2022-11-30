import {
  BelongsTo,
  Column,
  CreatedAt,
  ForeignKey,
  Model,
  Table,
  UpdatedAt,
} from 'sequelize-typescript';
import { INTEGER, JSON as SQLJSON, STRING } from 'sequelize';
import SubscriptionBilling from './subscription-billing';
import SubscriptionPayment from './subscription-payment';
import { Moment } from '@dave-inc/time-lib';

@Table({ tableName: 'subscription_collection_attempt' })
export default class SubscriptionCollectionAttempt extends Model<SubscriptionCollectionAttempt> {
  @Column({
    autoIncrement: true,
    primaryKey: true,
    type: INTEGER,
  })
  public id: number;

  @ForeignKey(() => SubscriptionBilling)
  @Column({ field: 'subscription_billing_id' })
  public subscriptionBillingId: number;

  @BelongsTo(() => SubscriptionBilling)
  public subscriptionBilling: SubscriptionBilling;

  @ForeignKey(() => SubscriptionPayment)
  @Column({ field: 'subscription_payment_id' })
  public subscriptionPaymentId: number;

  @BelongsTo(() => SubscriptionPayment)
  public subscriptionPayment: SubscriptionPayment;

  public setSubscriptionPayment: (subscriptionPayment: SubscriptionPayment) => void;

  public getSubscriptionPayment: () => PromiseLike<SubscriptionPayment>;

  @Column({ type: STRING(256) })
  public trigger: string;

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
    return Number.isInteger(this.subscriptionPaymentId);
  }
}
