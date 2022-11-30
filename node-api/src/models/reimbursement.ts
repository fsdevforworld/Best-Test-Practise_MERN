import {
  INTEGER,
  ENUM,
  DECIMAL,
  JSON as SQLJSON,
  STRING,
  TEXT,
  BelongsToGetAssociationMixin,
} from 'sequelize';
import { Moment } from 'moment';
import {
  BelongsTo,
  Column,
  ForeignKey,
  Model,
  Table,
  CreatedAt,
  Scopes,
  UpdatedAt,
} from 'sequelize-typescript';
import { serializeDate } from '../serialization';
import User from './user';
import Advance from './advance';
import InternalUser from './internal-user';
import SubscriptionPayment from './subscription-payment';
import { ExternalTransactionStatus } from '@dave-inc/wire-typings';
import { compact } from 'lodash';
import { ISerializable, ReimbursementResponse } from '../typings';
import { TabapayNetworkRCMapping } from '@dave-inc/loomis-client';
import DashboardActionLog from './dashboard-action-log';

export enum ReimbursementExternalProcessor {
  Tabapay = 'TABAPAY',
  TabapayACH = 'TABAPAY_ACH',
  Synapsepay = 'SYNAPSEPAY',
  Blastpay = 'BLASTPAY',
  Paypal = 'PAYPAL',
  Payfi = 'PAYFI',
  BankOfDave = 'BANK_OF_DAVE',
  Risepay = 'RISEPAY',
}

export const reimbursementProcessors = [
  'TABAPAY',
  'SYNAPSEPAY',
  'BLASTPAY',
  'PAYPAL',
  'BANK_OF_DAVE',
  'RISEPAY',
  'PAYFI',
] as const;

export enum ReimbursementPayableType {
  PAYMENT_METHOD = 'PAYMENT_METHOD',
  BANK_ACCOUNT = 'BANK_ACCOUNT',
}

export const statuses = [
  'PENDING',
  'UNKNOWN',
  'COMPLETED',
  'RETURNED',
  'CANCELED',
  'FAILED',
] as const;
export const completedOrPendingStatuses = ['COMPLETED', 'PENDING', 'UNKNOWN'] as const;

@Scopes(() => ({
  withDashboardAction: () => ({
    include: [{ model: DashboardActionLog.scope('withRelated') }],
  }),
}))
@Table({
  tableName: 'reimbursement',
})
export default class Reimbursement extends Model<Reimbursement>
  implements ISerializable<ReimbursementResponse> {
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
  public getUser: BelongsToGetAssociationMixin<User>;

  @ForeignKey(() => Advance)
  @Column({
    field: 'advance_id',
    type: INTEGER,
  })
  public advanceId: number;

  @BelongsTo(() => Advance)
  public advance: Advance;

  @ForeignKey(() => SubscriptionPayment)
  @Column({
    field: 'subscription_payment_id',
    type: INTEGER,
  })
  public subscriptionPaymentId: number;

  @BelongsTo(() => SubscriptionPayment)
  public subscriptionPayment: SubscriptionPayment;

  @ForeignKey(() => User)
  @Column({
    field: 'reimburser_id',
    type: INTEGER,
  })
  public reimburserId: number;

  @BelongsTo(() => InternalUser, 'reimburser_id')
  public reimburser: InternalUser;
  public getReimburser: BelongsToGetAssociationMixin<InternalUser>;

  @Column({
    type: new TEXT(),
  })
  public reason: string;

  @Column({
    type: DECIMAL(16, 2),
  })
  public amount: number;

  @Column({
    type: ENUM(...reimbursementProcessors),
    field: 'external_processor',
  })
  public externalProcessor: ReimbursementExternalProcessor;

  @Column({
    type: STRING(256),
    field: 'external_id',
  })
  public externalId: string;

  @Column({
    type: STRING(256),
    field: 'reference_id',
  })
  public referenceId: string;

  @Column({
    type: ENUM(...statuses),
  })
  public status: typeof statuses[number];

  @Column({
    type: INTEGER,
    field: 'payable_id',
  })
  public payableId: number;

  @Column({
    type: ENUM('PAYMENT_METHOD', 'BANK_ACCOUNT'),
    field: 'payable_type',
  })
  public payableType: ReimbursementPayableType;

  @Column({
    type: STRING(255),
    field: 'zendesk_ticket_id',
  })
  public zendeskTicketId: string;

  @Column({
    type: SQLJSON,
    field: 'webhook_data',
  })
  public webhookData: any;

  @Column({
    type: SQLJSON,
    field: 'extra',
  })
  public extra: any;

  @ForeignKey(() => DashboardActionLog)
  @Column({
    field: 'dashboard_action_log_id',
    type: INTEGER,
  })
  public dashboardActionLogId: number;

  @BelongsTo(() => DashboardActionLog)
  public dashboardActionLog: DashboardActionLog;

  @CreatedAt
  public created: Moment;

  @UpdatedAt
  public updated: Moment;

  public serialize(): ReimbursementResponse {
    const plainReimbursement = this.get({ plain: true }) as ReimbursementResponse;
    const transactionResult = plainReimbursement.extra?.transactionResult;
    const networkRC = transactionResult?.data?.networkRC;

    const networkRCIndex = `Code_${networkRC}` as keyof typeof TabapayNetworkRCMapping;
    const errorMessage = networkRC && TabapayNetworkRCMapping[networkRCIndex];

    return {
      ...plainReimbursement,
      created: serializeDate(this.created),
      updated: serializeDate(this.updated),
      extra: {
        ...plainReimbursement.extra,
        transactionResult: {
          ...transactionResult,
          errorMessage,
        },
      },
    };
  }

  public async updateStatus(status: ExternalTransactionStatus, webhookData?: any): Promise<void> {
    const updatedWebhookData = compact([].concat(this.webhookData, webhookData));

    await this.update({ status, webhookData: updatedWebhookData });
  }
}
