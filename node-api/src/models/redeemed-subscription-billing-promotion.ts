import { Moment } from 'moment';
import { INTEGER } from 'sequelize';
import {
  BelongsTo,
  CreatedAt,
  Column,
  ForeignKey,
  Model,
  Table,
  UpdatedAt,
} from 'sequelize-typescript';
import User from './user';
import SubscriptionBillingPromotion from './subscription-billing-promotion';

@Table({
  tableName: 'redeemed_subscription_billing_promotion',
})
export default class RedeemedSubscriptionBillingPromotion extends Model<
  RedeemedSubscriptionBillingPromotion
> {
  @Column({
    type: INTEGER,
    primaryKey: true,
    autoIncrement: true,
  })
  public id: number;

  @ForeignKey(() => User)
  @Column({
    field: 'user_id',
    type: INTEGER,
  })
  public userId: number;

  @BelongsTo(() => User, 'user_id')
  public user: User;

  @ForeignKey(() => SubscriptionBillingPromotion)
  @Column({
    field: 'subscription_billing_promotion_id',
    type: INTEGER,
  })
  public subscriptionBillingPromotionId: number;

  @BelongsTo(() => SubscriptionBillingPromotion, 'subscription_billing_promotion_id')
  public subscriptionBillingPromotion: User;

  @CreatedAt
  public created: Moment;

  @UpdatedAt
  public updated: Moment;
}
