import * as Bluebird from 'bluebird';
import { BelongsTo, Column, CreatedAt, Model, Table, UpdatedAt } from 'sequelize-typescript';
import {
  DATE,
  DECIMAL,
  ENUM,
  InstanceUpdateOptions,
  INTEGER,
  JSON as SQLJSON,
  STRING,
} from 'sequelize';
import { Moment } from 'moment';
import { moment } from '@dave-inc/time-lib';
import Payment from './payment';
import { TransactionSettlementSource } from '../typings/external-transaction';
import SubscriptionPayment from './subscription-payment';
import Advance from './advance';
import {
  TransactionSettlementStatus,
  ExternalTransactionProcessor,
  TransactionSettlementType,
} from '@dave-inc/wire-typings';

@Table({
  tableName: 'transaction_settlement',
})
export default class TransactionSettlement extends Model<TransactionSettlement> {
  @Column({
    autoIncrement: true,
    primaryKey: true,
    type: INTEGER,
  })
  public id: number;

  @Column({
    type: STRING(256),
    field: 'external_id',
  })
  public externalId: string;

  @Column({
    type: ENUM('DISBURSEMENT', 'PAYMENT'),
  })
  public type: TransactionSettlementType;

  @Column({
    type: ENUM('PENDING', 'ERROR', 'COMPLETED', 'CANCELED', 'REPRESENTMENT', 'CHARGEBACK'),
  })
  public status: TransactionSettlementStatus;

  @Column({
    type: STRING(256),
    field: 'full_name',
  })
  public fullName: string;

  @Column({
    type: STRING(4),
    field: 'last_four',
  })
  public lastFour: string;

  @Column({
    type: DECIMAL(16, 2),
  })
  public amount: number;

  @Column({
    type: DATE,
    field: 'representment_start',
  })
  public representmentStart: Moment;

  @Column({
    type: DATE,
    field: 'representment_end',
  })
  public representmentEnd: Moment;

  @Column({
    type: SQLJSON,
  })
  public modifications: any;

  @CreatedAt
  public created: Moment;

  @UpdatedAt
  public updated: Moment;

  @Column({
    type: DATE,
    field: 'processed',
  })
  public processed: Moment;

  @Column({
    type: INTEGER,
    field: 'source_id',
  })
  public sourceId: number;

  @Column({
    type: ENUM('PAYMENT', 'SUBSCRIPTION_PAYMENT', 'ADVANCE'),
    field: 'source_type',
  })
  public sourceType: TransactionSettlementSource;

  @Column({
    type: ENUM('TABAPAY', 'RISEPAY', 'SYNAPSEPAY', 'BLASTPAY'),
    field: 'processor',
  })
  public processor: ExternalTransactionProcessor;

  @Column({
    type: SQLJSON,
  })
  public raw: any;

  @BelongsTo(() => Payment, {
    foreignKey: 'source_id',
    constraints: false,
    as: TransactionSettlementSource.Payment,
  })
  @BelongsTo(() => Advance, {
    foreignKey: 'source_id',
    constraints: false,
    as: TransactionSettlementSource.Advance,
  })
  @BelongsTo(() => SubscriptionPayment, {
    foreignKey: 'source_id',
    constraints: false,
    as: TransactionSettlementSource.SubscriptionPayment,
  })
  public update(
    keys: any,
    options: InstanceUpdateOptions & { metadata?: any } = {},
  ): Bluebird<this> {
    const modification: any = {
      new: Object.assign({}, keys),
      old: {},
      time: moment().format(),
      metadata: options.metadata,
    };
    for (const variable in keys) {
      if (keys.hasOwnProperty(variable)) {
        modification.old[variable] = this.get(variable);
      }
    }
    keys.modifications = (this.modifications || []).concat([modification]);
    return super.update(keys, options);
  }
}
