import Bluebird from 'bluebird';
import { Moment, moment } from '@dave-inc/time-lib';
import { BOOLEAN, DATE, DATEONLY, FindOptions, INTEGER, STRING } from 'sequelize';
import {
  BelongsTo,
  Column,
  CreatedAt,
  DeletedAt,
  ForeignKey,
  Model,
  Table,
  UpdatedAt,
} from 'sequelize-typescript';

import BankAccount from './bank-account';
import User from './user';
import { ISerializable } from '../typings';
import { serializeDate } from '../serialization';
import { PaymentMethodResponse } from '@dave-inc/wire-typings';

@Table({
  tableName: 'payment_method',
})
export default class PaymentMethod extends Model<PaymentMethod>
  implements ISerializable<PaymentMethodResponse> {
  @Column({
    autoIncrement: true,
    primaryKey: true,
    type: INTEGER,
  })
  public id: number;

  @ForeignKey(() => BankAccount)
  @Column({
    field: 'bank_account_id',
    type: INTEGER,
  })
  public bankAccountId: number;

  @BelongsTo(() => BankAccount)
  public bankAccount: BankAccount;
  public getBankAccount: (options?: FindOptions) => Promise<BankAccount>;

  @ForeignKey(() => User)
  @Column({
    field: 'user_id',
    type: INTEGER,
  })
  public userId: number;

  @BelongsTo(() => User)
  public user: User;

  @Column({
    type: STRING(32),
  })
  public availability: string;

  @Column({
    type: STRING(256),
    field: 'risepay_id',
  })
  public risepayId: string;

  @Column({
    type: STRING(256),
    field: 'tabapay_id',
  })
  public tabapayId: string;

  @Column({
    type: STRING(4),
  })
  public mask: string;

  @Column({
    type: STRING(256),
    field: 'display_name',
  })
  public displayName: string;

  @Column({
    type: DATEONLY,
  })
  public expiration: Moment;

  @Column({
    type: STRING(32),
  })
  public scheme: string;

  @Column({
    type: STRING(10),
    field: 'zip_code',
  })
  public zipCode: string;

  @Column({
    type: BOOLEAN,
  })
  public linked: string;

  @Column({
    type: DATE,
  })
  public invalid: Moment;

  @Column({
    type: STRING(256),
    field: 'invalid_reason_code',
  })
  public invalidReasonCode: string;

  @Column({
    type: BOOLEAN,
    field: 'opted_into_dave_rewards',
  })
  public optedIntoDaveRewards: boolean;

  @Column({
    type: INTEGER,
    field: 'empyr_card_id',
  })
  public empyrCardId: number;

  @Column({
    type: STRING(255),
    field: 'bin',
  })
  public bin: string;

  @CreatedAt
  public created: Date;

  @UpdatedAt
  public updated: Date;

  @DeletedAt
  public deleted: Date;

  public invalidate(reasonCode: string): Bluebird<this> {
    return this.update({
      invalid: moment(),
      invalidReasonCode: reasonCode,
    });
  }

  public serialize(): PaymentMethodResponse {
    return {
      id: this.id,
      displayName: this.displayName,
      scheme: this.scheme,
      mask: this.mask,
      expiration: serializeDate(this.expiration),
      invalid: serializeDate(this.invalid),
      optedIntoDaveRewards: this.optedIntoDaveRewards,
      empyrCardId: this.empyrCardId,
      zipCode: this.zipCode,
    };
  }
}
