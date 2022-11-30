import { INTEGER } from 'sequelize';
import { BelongsTo, Column, ForeignKey, Model, Table } from 'sequelize-typescript';

import SubscriptionBilling from './subscription-billing';
import SubscriptionPayment from './subscription-payment';

@Table({
  tableName: 'subscription_payment_line_item',
  timestamps: false,
})
export default class SubscriptionPaymentLineItem extends Model<SubscriptionPaymentLineItem> {
  @ForeignKey(() => SubscriptionBilling)
  @Column({
    field: 'subscription_billing_id',
    type: INTEGER,
  })
  public subscriptionBillingId: number;

  @BelongsTo(() => SubscriptionBilling)
  public subscriptionBilling: SubscriptionBilling;

  @ForeignKey(() => SubscriptionPayment)
  @Column({
    field: 'subscription_payment_id',
    type: INTEGER,
  })
  public subscriptionPaymentId: number;

  @BelongsTo(() => SubscriptionPayment)
  public subscriptionPayment: SubscriptionPayment;
}
