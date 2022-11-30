import { Moment } from 'moment';
import {
  STRING,
  INTEGER,
  DECIMAL,
  ENUM,
  JSON as SQLJSON,
  FindOptions,
  BelongsToManyGetAssociationsMixin,
  HasManyGetAssociationsMixin,
} from 'sequelize';
import {
  CreatedAt,
  UpdatedAt,
  HasMany,
  HasOne,
  BelongsTo,
  Column,
  ForeignKey,
  Model,
  Table,
  BelongsToMany,
  DeletedAt,
  Scopes,
} from 'sequelize-typescript';
import { Op } from 'sequelize';
import User from './user';
import BankAccount from './bank-account';
import PaymentMethod from './payment-method';
import SubscriptionBilling from './subscription-billing';
import SubscriptionPaymentLineItem from './subscription-payment-line-item';
import Reimbursement from './reimbursement';
import { TransactionSettlementSource, IExternalTransaction } from '../typings';
import TransactionSettlement from './transaction-settlement';
import SubscriptionCollectionAttempt from './subscription-collection-attempt';
import { ExternalTransactionStatus, ExternalTransactionProcessor } from '@dave-inc/wire-typings';
import { compact } from 'lodash';

export const subscriptionPaymentExternalProcessors = [
  ExternalTransactionProcessor.Tabapay,
  ExternalTransactionProcessor.Synapsepay,
  ExternalTransactionProcessor.BankOfDave,
  ExternalTransactionProcessor.Risepay,
];

@Scopes({
  processed: {
    where: {
      status: {
        [Op.in]: [
          ExternalTransactionStatus.Completed,
          ExternalTransactionStatus.Pending,
          ExternalTransactionStatus.Unknown,
        ],
      },
    },
  },
})
@Table({
  tableName: 'subscription_payment',
  paranoid: true,
})
export default class SubscriptionPayment extends Model<SubscriptionPayment>
  implements IExternalTransaction {
  @BelongsToMany(
    () => SubscriptionBilling,
    () => SubscriptionPaymentLineItem,
  )
  public subscriptionBillings: SubscriptionBilling[];
  public getSubscriptionBillings: BelongsToManyGetAssociationsMixin<SubscriptionBilling>;
  public addSubscriptionBilling: (subscriptionBilling: SubscriptionBilling) => void;

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
  public getUser: () => Promise<User>;

  @ForeignKey(() => BankAccount)
  @Column({
    field: 'bank_account_id',
    type: INTEGER,
  })
  public bankAccountId: number;
  public getBankAccount: (options?: FindOptions) => Promise<BankAccount>;

  @BelongsTo(() => BankAccount)
  public bankAccount: BankAccount;

  @ForeignKey(() => PaymentMethod)
  @Column({
    field: 'payment_method_id',
    type: INTEGER,
  })
  public paymentMethodId: number;

  @BelongsTo(() => PaymentMethod)
  public paymentMethod: PaymentMethod;

  @HasOne(() => SubscriptionCollectionAttempt)
  public subscriptionCollectionAttempt: SubscriptionCollectionAttempt;

  @HasMany(() => Reimbursement)
  public reimbursements: Reimbursement[];
  public getReimbursements: HasManyGetAssociationsMixin<Reimbursement>;

  @Column({
    field: 'amount',
    type: DECIMAL(16, 2),
  })
  public amount: number;

  @Column({
    field: 'external_processor',
    type: ENUM(...subscriptionPaymentExternalProcessors),
  })
  public externalProcessor: ExternalTransactionProcessor;

  @Column({
    field: 'external_id',
    type: STRING(256),
  })
  public externalId: string;

  @Column({
    field: 'status',
    type: ENUM('PENDING', 'UNKNOWN', 'COMPLETED', 'RETURNED', 'CANCELED', 'CHARGEBACK'),
  })
  public status: ExternalTransactionStatus;

  @Column({
    type: SQLJSON,
    field: 'webhook_data',
  })
  public webhookData: any;

  @CreatedAt
  public created: Moment;

  @UpdatedAt
  public updated: Moment;

  @Column({
    type: STRING(16),
    field: 'reference_id',
  })
  public referenceId: string;

  @DeletedAt
  public deleted: Date;

  @HasMany(() => TransactionSettlement, {
    foreignKey: 'source_id',
    scope: {
      source_type: TransactionSettlementSource.SubscriptionPayment,
    },
  })
  public transactionSettlements: TransactionSettlement[];

  public isPaid() {
    return (
      this.status === ExternalTransactionStatus.Pending ||
      this.status === ExternalTransactionStatus.Completed ||
      this.status === ExternalTransactionStatus.Chargeback
    );
  }

  public async updateStatus(status: ExternalTransactionStatus, webhookData?: any) {
    const updatedWebhookData = compact([].concat(this.webhookData, webhookData));

    await this.update({ status, webhookData: updatedWebhookData });
  }
}
