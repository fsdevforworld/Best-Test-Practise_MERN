import {
  AdvanceDelivery,
  AdvanceDestination,
  AdvanceNetwork,
  AdvanceResponse,
  AdvanceType,
  ExternalTransactionProcessor,
  ExternalTransactionStatus,
} from '@dave-inc/wire-typings';
import * as config from 'config';
import {
  BOOLEAN,
  DATE,
  DATEONLY,
  DECIMAL,
  ENUM,
  FindOptions,
  fn,
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
import { getExpectedDelivery } from '../domain/advance-delivery';
import { dogstatsd } from '../lib/datadog-statsd';
import logger from '../lib/logger';
import { moment, Moment } from '@dave-inc/time-lib';
import { ACTIVE_TIMESTAMP } from '../lib/sequelize';
import { encode } from '../lib/jwt';
import { serializeDate } from '../serialization';
import {
  AnalyticsUserProperty,
  BrazeUserAttributes,
  IExternalTransaction,
  TransactionSettlementSource,
} from '../typings';
import AdvanceApproval from './advance-approval';
import AdvanceCollectionAttempt from './advance-collection-attempt';
import AdvanceCollectionSchedule from './advance-collection-schedule';
import AdvanceExperimentLog from './advance-experiment-log';
import AdvanceTip from './advance-tip';
import BankAccount from './bank-account';
import BankTransaction from './bank-transaction';
import DonationOrganization from './donation-organization';
import Payment from './payment';
import PaymentMethod from './payment-method';
import Reimbursement from './reimbursement';
import TransactionSettlement from './transaction-settlement';
import User from './user';

const DAVE_WEBSITE_URL = config.get('dave.website.url');

export const disbursementProcessors = [
  'TABAPAY',
  'RISEPAY',
  'SYNAPSEPAY',
  'BLASTPAY',
  'PAYFI',
  'BANK_OF_DAVE',
] as const;

@Scopes({
  pastDue: {
    where: {
      outstanding: { [Op.gt]: 0 },
      disbursementStatus: ExternalTransactionStatus.Completed,
      paybackDate: { [Op.lt]: fn('CURDATE') },
    },
  },
  collectibleAdvance: {
    where: {
      outstanding: { [Op.gt]: 0 },
      disbursementStatus: ExternalTransactionStatus.Completed,
      paybackFrozen: false,
    },
  },
})
@Table({
  tableName: 'advance',
  paranoid: true,
})
export default class Advance extends Model<Advance> implements IExternalTransaction {
  @BeforeUpdate
  public static recordModifications(instance: Advance, { metadata }: { metadata: object }) {
    const changedKeys = instance.changed();

    if (Array.isArray(changedKeys)) {
      const modification = changedKeys.reduce(
        (mod: any, key: keyof Advance) => {
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

      instance.modifications = (instance.modifications || []).concat(modification);
    }
  }

  public static async getOverdue(startDate: Moment, endDate: Moment): Promise<Advance[]> {
    return Advance.findAll({
      where: {
        outstanding: { [Op.gt]: 0 },
        disbursementStatus: ExternalTransactionStatus.Completed,
        paybackDate: { [Op.lte]: moment() },
        created: { [Op.between]: [startDate.toISOString(), endDate.toISOString()] },
      },
    });
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

  @DeletedAt
  @Column({
    defaultValue: moment(ACTIVE_TIMESTAMP),
    type: DATE,
  })
  public deleted: Moment;

  @ForeignKey(() => User)
  @Column({
    field: 'user_id',
    type: INTEGER,
  })
  public userId: number;

  @BelongsTo(() => User)
  public user: User;

  public getUser: (options?: FindOptions) => PromiseLike<User>;

  @ForeignKey(() => BankAccount)
  @Column({
    field: 'bank_account_id',
    type: INTEGER,
  })
  public bankAccountId: number;

  @BelongsTo(() => BankAccount)
  public bankAccount: BankAccount;

  public getBankAccount: (options?: FindOptions) => PromiseLike<BankAccount>;

  @ForeignKey(() => BankTransaction)
  @Column({
    field: 'disbursement_bank_transaction_id',
    type: INTEGER,
  })
  public disbursementBankTransactionId: number;

  @Column({
    field: 'disbursement_bank_transaction_uuid',
    type: STRING,
  })
  public disbursementBankTransactionUuid: string;

  @ForeignKey(() => PaymentMethod)
  @Column({
    field: 'payment_method_id',
    type: INTEGER,
  })
  public paymentMethodId: number;

  @BelongsTo(() => PaymentMethod)
  public paymentMethod: PaymentMethod;

  public getPaymentMethod: (options?: FindOptions) => PromiseLike<PaymentMethod>;

  @ForeignKey(() => AdvanceApproval)
  @Column({
    field: 'chosen_advance_approval_id',
    type: INTEGER,
  })
  public chosenAdvanceApprovalId?: number;

  @BelongsTo(() => AdvanceApproval)
  public chosenAdvanceApproval?: AdvanceApproval;
  public getChosenAdvanceApproval: (options?: FindOptions) => PromiseLike<AdvanceApproval>;

  @Column({
    type: BOOLEAN,
    field: 'payback_frozen',
  })
  public paybackFrozen: boolean;

  @Column({
    type: STRING(256),
    field: 'external_id',
  })
  public externalId: string;

  @Column({
    type: STRING(16),
    field: 'reference_id',
  })
  public referenceId: string;

  @Column({
    type: DECIMAL(16, 2),
  })
  public amount: number;

  @Column({
    type: DECIMAL(16, 2),
  })
  set fee(value: number) {
    this.setDataValue('fee', value);
  }

  get fee(): number {
    return this.getDataValue('fee') || 0;
  }

  @Column({
    type: DECIMAL(16, 2),
  })
  public outstanding: number;

  @Column({
    type: ENUM('PENDING', 'UNKNOWN', 'COMPLETED', 'RETURNED', 'CANCELED', 'NOTDISBURSED'),
    field: 'disbursement_status',
    defaultValue: 'PENDING',
  })
  public disbursementStatus: ExternalTransactionStatus;

  @Column({
    type: DATEONLY,
    field: 'payback_date',
  })
  public paybackDate: Moment;

  @Column({
    type: INTEGER,
    field: 'legacy_id',
  })
  public legacyId: number;

  @Column({
    type: ENUM(...disbursementProcessors),
    field: 'disbursement_processor',
  })
  public disbursementProcessor: ExternalTransactionProcessor;

  @Column({
    type: ENUM('STANDARD', 'EXPRESS'),
  })
  public delivery: AdvanceDelivery;

  @Column({
    type: SQLJSON,
  })
  public modifications: any;

  @Column({
    type: STRING(256),
    field: 'screenshot_image',
  })
  public screenshotImage: string;

  @Column({
    type: DATEONLY,
    field: 'created_date',
    defaultValue: () => moment().format('YYYY-MM-DD'),
  })
  public createdDate: Moment;

  @Column({
    type: STRING(256),
    field: 'approval_code',
  })
  public approvalCode: string;

  @Column({
    type: STRING(256),
    field: 'network',
  })
  public network: string;

  @Column({
    type: STRING(256),
    field: 'network_id',
  })
  public networkId: string;

  @HasOne(() => AdvanceExperimentLog)
  public advanceExperimentLog: AdvanceExperimentLog;
  public getAdvanceExperimentLog: () => Promise<AdvanceExperimentLog>;

  @HasOne(() => AdvanceTip)
  public advanceTip: AdvanceTip;
  public getAdvanceTip: () => Promise<AdvanceTip>;

  @HasMany(() => Payment)
  public payments: Payment[];
  public getPayments: () => Promise<Payment[]>;

  @HasMany(() => AdvanceCollectionAttempt)
  public advanceCollectionAttempts: AdvanceCollectionAttempt[];

  @HasMany(() => AdvanceCollectionAttempt)
  public activeCollectionAttempts: AdvanceCollectionAttempt[];

  @HasMany(() => AdvanceCollectionAttempt)
  public successfulCollections: AdvanceCollectionAttempt[];

  @HasMany(() => AdvanceCollectionSchedule)
  public scheduledAdvanceCollections: AdvanceCollectionSchedule[];
  public getScheduledAdvanceCollections: () => Promise<AdvanceCollectionSchedule[]>;

  @HasMany(() => TransactionSettlement, {
    foreignKey: 'source_id',
    scope: {
      source_type: TransactionSettlementSource.Advance,
    },
  })
  public transactionSettlements: TransactionSettlement[];
  public getTransactionSettlements: () => Promise<TransactionSettlement[]>;

  @HasMany(() => Reimbursement)
  public reimbursements: Reimbursement[];
  public getReimbursements: () => Promise<Reimbursement[]>;

  public advanceType(): AdvanceType {
    return this.amount >= 25 ? AdvanceType.normalAdvance : AdvanceType.microAdvance;
  }

  public isMicroAdvance(): boolean {
    return this.advanceType() === AdvanceType.microAdvance;
  }

  public isPaid(): boolean {
    return this.outstanding === 0;
  }

  public isNormalAdvance(): boolean {
    return this.advanceType() === AdvanceType.normalAdvance;
  }

  public getWebPaybackUrl(): string {
    return `${DAVE_WEBSITE_URL}/payback/${encode({ id: this.id }, { expire: false })}`;
  }

  public getNetwork(): AdvanceNetwork | null {
    // for backwards compatibility with versions < 2.14.6
    const network =
      this.approvalCode || this.networkId
        ? {
            approvalCode: this.approvalCode,
            networkId: this.networkId,
            settlementNetwork: this.network,
          }
        : null;

    return network;
  }

  public async lazyGetAdvanceTip(includeDonationOrganization = false): Promise<AdvanceTip> {
    if (!this.advanceTip) {
      this.advanceTip = await AdvanceTip.findOne({
        where: { advanceId: this.id },
        include: includeDonationOrganization ? [DonationOrganization] : [],
      });
    }
    return this.advanceTip;
  }

  public async getDestination(): Promise<AdvanceDestination> {
    if (this.disbursementProcessor === ExternalTransactionProcessor.Tabapay) {
      const card = this.paymentMethod || (await this.getPaymentMethod({ paranoid: false }));
      return { lastFour: card?.mask, displayName: card?.displayName, scheme: card?.scheme };
    } else if (
      this.disbursementProcessor === ExternalTransactionProcessor.Synapsepay ||
      this.disbursementProcessor === ExternalTransactionProcessor.BankOfDave
    ) {
      const bankAccount = this.bankAccount || (await this.getBankAccount({ paranoid: false }));
      return { lastFour: bankAccount?.lastFour, displayName: bankAccount?.displayName };
    } else if (this.disbursementProcessor) {
      logger.info(`No match for advance disbursement processor`, { advanceId: this.id });
      dogstatsd.increment('advance_serialization.no_match_disbursement_processor', {
        processor: this.disbursementProcessor,
      });
    }
    return null;
  }

  // The serialize function for the Advance model used to include tip and tipPercent
  // Since we removed those two columns from the table, we now have this function to return the same contract to the FE
  public async serializeAdvanceWithTip(): Promise<AdvanceResponse> {
    const advanceTip = await this.lazyGetAdvanceTip(true);
    const [donationOrganization, destination] = await Promise.all([
      advanceTip.getDonationOrganization(),
      this.getDestination(),
    ]);

    return {
      amount: this.amount,
      bankAccountId: this.bankAccountId,
      created: serializeDate(this.created),
      delivery: this.delivery,
      destination,
      disbursementBankTransactionId: this.disbursementBankTransactionId,
      disbursementStatus: this.disbursementStatus,
      donationOrganization: donationOrganization?.code,
      expectedDelivery: serializeDate(getExpectedDelivery(this.created, this.delivery)),
      fee: this.fee,
      id: this.id,
      network: this.getNetwork(),
      outstanding: this.outstanding,
      paybackDate: serializeDate(this.paybackDate, 'YYYY-MM-DD'),
      tip: advanceTip.amount,
      tipPercent: advanceTip.percent,
    };
  }

  public async getUserAttributes(): Promise<Partial<BrazeUserAttributes>> {
    let advanceTip = this.advanceTip;
    if (!advanceTip) {
      advanceTip = await this.getAdvanceTip();
    }
    return {
      [AnalyticsUserProperty.AdvanceAmount]: this.amount,
      [AnalyticsUserProperty.AdvanceDueDate]: this.paybackDate.format('YYYY-MM-DD'),
      [AnalyticsUserProperty.AdvanceFee]: this.fee,
      [AnalyticsUserProperty.AdvanceOutstanding]: this.outstanding,
      [AnalyticsUserProperty.AdvancePaybackUrl]: this.getWebPaybackUrl(),
      [AnalyticsUserProperty.AdvanceTip]: advanceTip.amount,
      [AnalyticsUserProperty.AdvanceTipPercent]: advanceTip.percent,
    };
  }
}
