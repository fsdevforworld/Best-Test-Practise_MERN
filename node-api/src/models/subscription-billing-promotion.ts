import { Moment } from 'moment';
import {
  SubscriptionBillingPromotionResponse,
  SubscriptionBillingPromotionCode,
} from '@dave-inc/wire-typings';
import { INTEGER, STRING } from 'sequelize';
import { CreatedAt, Column, DeletedAt, Model, Table, UpdatedAt } from 'sequelize-typescript';
import { ISerializable } from '../typings';

@Table({
  tableName: 'subscription_billing_promotion',
  paranoid: true,
})
export default class SubscriptionBillingPromotion extends Model<SubscriptionBillingPromotion>
  implements ISerializable<SubscriptionBillingPromotionResponse> {
  @Column({
    type: INTEGER,
    primaryKey: true,
    autoIncrement: true,
  })
  public id: number;

  @Column({
    type: STRING,
  })
  public description: string;

  @Column({
    type: STRING,
  })
  public code: SubscriptionBillingPromotionCode;

  @Column({
    type: INTEGER,
  })
  public months: number;

  @DeletedAt
  public deleted: Moment;

  @CreatedAt
  public created: Moment;

  @UpdatedAt
  public updated: Moment;

  public serialize(): SubscriptionBillingPromotionResponse {
    return {
      id: this.id,
      description: this.description,
      code: this.code,
      months: this.months,
    };
  }
}
