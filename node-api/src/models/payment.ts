import {
  DECIMAL,
  ENUM,
  FindOptions,
  HasOneGetAssociationMixin,
  INTEGER,
  JSON as SQLJSON,
  Op,
  STRING,
} from 'sequelize';
import {
  BeforeUpdate,
  BelongsTo,
  Column,
  CreatedAt,
  DeletedAt,
  ForeignKey,
  HasMany,
  HasOne,
  Model,
  Scopes,
  Table,
  UpdatedAt,
} from 'sequelize-typescript';
import { moment, Moment } from '@dave-inc/time-lib';
import { serializeDate } from '../serialization';
import Advance from './advance';
import BankAccount from './bank-account';
import BankTransaction from './bank-transaction';
import DashboardPayment from './dashboard-payment';
import PaymentMethod from './payment-method';
import User from './user';
import PaymentReversal from './payment-reversal';
import TransactionSettlement from './transaction-settlement';
import { IExternalTransaction, ISerializable, TransactionSettlementSource } from '../typings';
import { isString, result } from 'lodash';
import {
  ExternalTransactionProcessor,
  ExternalTransactionStatus,
  PaymentMethodResponse,
  PaymentResponse,
} from '@dave-inc/wire-typings';
import logger from '../lib/logger';

export const completedOrPendingStatuses = [
  ExternalTransactionStatus.Completed,
  ExternalTransactionStatus.Pending,
  ExternalTransactionStatus.Chargeback,
  ExternalTransactionStatus.Unknown,
];

export const paymentExternalProcessors = [
  ExternalTransactionProcessor.Tabapay,
  ExternalTransactionProcessor.Synapsepay,
  ExternalTransactionProcessor.BankOfDave,
];

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
  paranoid: true,
  tableName: 'payment',
})
export default class Payment extends Model<Payment>
  implements ISerializable<PaymentResponse>, IExternalTransaction {
  @BeforeUpdate
  public static recordModifications(instance: Payment, { metadata }: any) {
    const changedKeys = instance.changed();

    if (Array.isArray(changedKeys)) {
      const filteredKeys = changedKeys.filter(key => key !== 'webhookData');
      if (filteredKeys.length === 0) {
        return;
      }
      const modification = filteredKeys.reduce(
        (mod: any, key: keyof Payment) => {
          mod.current[key] = instance.getDataValue(key);
          mod.previous[key] = instance.previous(key);

          return mod;
        },
        {
          time: moment().format(),
          current: {},
          previous: {},
        },
      );

      if (metadata) {
        modification.metadata = metadata;
      }

      // not sure why this is happening but it is.
      if (isString(instance.modifications)) {
        try {
          instance.modifications = JSON.parse(instance.modifications);
        } catch (error) {
          instance.modifications = []; // just wipe out the bad json because it's already unreadable [Object object] and programmatically un-usable
          logger.error('Error parsing payment modifications', { error });
          instance.modifications = [];
        }
      }

      instance.modifications = (instance.modifications || []).concat(modification);
    }
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

  @ForeignKey(() => Advance)
  @Column({
    field: 'advance_id',
    type: INTEGER,
  })
  public advanceId: number;

  @BelongsTo(() => Advance)
  public advance: Advance;
  public getAdvance: (options?: FindOptions) => Promise<Advance>;

  @HasMany(() => TransactionSettlement, {
    foreignKey: 'source_id',
    scope: {
      source_type: TransactionSettlementSource.Payment,
    },
  })
  public transactionSettlements: TransactionSettlement[];

  @ForeignKey(() => BankAccount)
  @Column({
    field: 'bank_account_id',
    type: INTEGER,
  })
  public bankAccountId: number;
  public getBankAccount: (options?: FindOptions) => Promise<BankAccount>;

  @BelongsTo(() => BankAccount)
  public bankAccount: BankAccount;

  @ForeignKey(() => BankTransaction)
  @Column({
    field: 'bank_transaction_id',
    type: INTEGER,
  })
  public bankTransactionId: number;

  @Column({
    field: 'bank_transaction_uuid',
    type: STRING,
  })
  public bankTransactionUuid: string;

  @BelongsTo(() => BankTransaction)
  public bankTransaction: BankTransaction;

  @HasOne(() => DashboardPayment, { foreignKey: 'paymentReferenceId', sourceKey: 'referenceId' })
  public dashboardPayment: DashboardPayment;
  public getDashboardPayment: HasOneGetAssociationMixin<DashboardPayment>;

  @ForeignKey(() => PaymentMethod)
  @Column({
    field: 'payment_method_id',
    type: INTEGER,
  })
  public paymentMethodId: number;

  @BelongsTo(() => PaymentMethod)
  public paymentMethod: PaymentMethod;

  @ForeignKey(() => User)
  @Column({
    field: 'user_id',
    type: INTEGER,
  })
  public userId: number;

  public getUser: () => PromiseLike<User>;

  @BelongsTo(() => User)
  public user: User;

  @Column({
    type: DECIMAL(16, 2),
  })
  public amount: number;

  @Column({
    type: ENUM(...paymentExternalProcessors),
    field: 'external_processor',
  })
  public externalProcessor: ExternalTransactionProcessor;

  @Column({
    type: STRING(256),
    field: 'external_id',
  })
  public externalId: string;

  @Column({
    type: ENUM('PENDING', 'UNKNOWN', 'COMPLETED', 'RETURNED', 'CANCELED', 'CHARGEBACK'),
  })
  public status: ExternalTransactionStatus;

  @Column({
    type: INTEGER,
    field: 'legacy_id',
  })
  public legacyId: number;

  @Column({
    type: SQLJSON,
    field: 'webhook_data',
  })
  public webhookData: any;

  @Column({
    type: STRING(16),
    field: 'reference_id',
  })
  public referenceId: string;

  @Column({
    type: SQLJSON,
  })
  public modifications: any;

  @DeletedAt
  public deleted: Date;

  @HasMany(() => PaymentReversal)
  public reversals: PaymentReversal[];
  public getReversals: () => Promise<PaymentReversal[]>;

  public get isDebit() {
    return (
      this.externalProcessor === ExternalTransactionProcessor.Tabapay ||
      this.externalProcessor === ExternalTransactionProcessor.BankOfDave
    );
  }

  public get isACH() {
    return !this.isDebit;
  }

  public serialize(): PaymentResponse {
    return {
      id: this.id,
      userId: this.userId,
      advanceId: this.advanceId,
      bankAccountId: this.bankAccountId,
      bankTransactionId: this.bankTransactionId,
      paymentMethodId: this.paymentMethodId,
      amount: this.amount,
      legacyId: this.legacyId,
      externalProcessor: this.externalProcessor,
      externalId: this.externalId,
      referenceId: this.referenceId,
      status: this.status,
      paymentMethod: result<PaymentMethodResponse>(this, 'paymentMethod.serialize'),
      deleted: serializeDate(this.deleted),
      created: serializeDate(this.created),
      updated: serializeDate(this.updated),
    };
  }
}
