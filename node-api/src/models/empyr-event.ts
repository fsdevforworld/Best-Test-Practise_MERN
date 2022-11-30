import { Moment } from 'moment';
import { DATE, DECIMAL, ENUM, INTEGER, STRING, TEXT } from 'sequelize';
import {
  BelongsTo,
  Column,
  ForeignKey,
  Model,
  Table,
  CreatedAt,
  UpdatedAt,
} from 'sequelize-typescript';
import { serializeDate } from '../serialization';
import User from './user';
import PaymentMethod from './payment-method';
import { ISerializable } from '../typings';
import { EmpyrEventType, EmpyrEventResponse } from '@dave-inc/wire-typings';

@Table({
  tableName: 'empyr_event',
})
export default class EmpyrEvent extends Model<EmpyrEvent>
  implements ISerializable<EmpyrEventResponse> {
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

  @ForeignKey(() => PaymentMethod)
  @Column({
    field: 'payment_method_id',
    type: INTEGER,
  })
  public paymentMethodId: number;

  @BelongsTo(() => PaymentMethod)
  public paymentMethod: PaymentMethod;

  @Column({
    field: 'transaction_id',
    type: INTEGER,
  })
  public transactionId: number;

  @Column({
    field: 'card_id',
    type: INTEGER,
  })
  public cardId: number;

  @Column({
    field: 'event_type',
    type: ENUM('AUTHORIZED', 'CLEARED', 'REMOVED', 'REMOVED_DUP'),
  })
  public eventType: EmpyrEventType;

  @Column({
    field: 'cleared_amount',
    type: DECIMAL(16, 2),
  })
  public clearedAmount: number;

  @Column({
    field: 'authorized_amount',
    type: DECIMAL(16, 2),
  })
  public authorizedAmount: number;

  @Column({
    field: 'reward_amount',
    type: DECIMAL(16, 2),
  })
  public rewardAmount: number;

  @Column({
    field: 'commission',
    type: DECIMAL(16, 2),
  })
  public commission: number;

  @Column({
    field: 'transaction_date',
    type: DATE,
  })
  public transactionDate: Moment;

  @Column({
    field: 'processed_date',
    type: DATE,
  })
  public processedDate: Moment;

  @Column({
    field: 'venue_id',
    type: INTEGER,
  })
  public venueId: number;

  @Column({
    field: 'venue_name',
    type: STRING(256),
  })
  public venueName: string;

  @Column({
    field: 'venue_thumbnail_url',
    type: new TEXT('medium'),
  })
  public venueThumbnailUrl: string;

  @Column({
    field: 'venue_address',
    type: STRING(256),
  })
  public venueAddress: string;

  @Column({
    field: 'venue_city',
    type: STRING(256),
  })
  public venueCity: string;

  @Column({
    field: 'venue_state',
    type: STRING(256),
  })
  public venueState: string;

  @Column({
    field: 'venue_postal_code',
    type: STRING(10),
  })
  public venuePostalCode: string;

  @CreatedAt
  public created: Date;

  @UpdatedAt
  public updated: Date;

  public serialize(): EmpyrEventResponse {
    return {
      id: this.id,
      userId: this.userId,
      paymentMethodId: this.paymentMethodId,
      transactionId: this.transactionId,
      cardId: this.cardId,
      eventType: this.eventType,
      clearedAmount: this.clearedAmount,
      authorizedAmount: this.authorizedAmount,
      rewardAmount: this.rewardAmount,
      commission: this.commission,
      transactionDate: serializeDate(this.transactionDate),
      processedDate: serializeDate(this.processedDate),
      venueId: this.venueId,
      venueName: this.venueName,
      venueThumbnailUrl: this.venueThumbnailUrl,
      venueAddress: this.venueAddress,
      venueCity: this.venueCity,
      venueState: this.venueState,
      venuePostalCode: this.venuePostalCode,
      created: serializeDate(this.created),
      updated: serializeDate(this.updated),
    };
  }
}
