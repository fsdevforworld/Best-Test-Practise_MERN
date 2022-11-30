import { Moment } from 'moment';
import { DATE, DECIMAL, ENUM, FindOptions, INTEGER, Op, STRING } from 'sequelize';
import {
  BelongsTo,
  Column,
  CreatedAt,
  DefaultScope,
  DeletedAt,
  ForeignKey,
  HasMany,
  Model,
  Scopes,
  Table,
  UpdatedAt,
} from 'sequelize-typescript';
import { ConflictError, InvalidParametersError } from '../lib/error';
import Advance from './advance';
import BankConnection from './bank-connection';
import { BankTransaction, SortOrder } from '@dave-inc/heath-client';
import Institution from './institution';
import Payment from './payment';
import PaymentMethod from './payment-method';
import User from './user';
import * as Bluebird from 'bluebird';
import { moment } from '@dave-inc/time-lib';
import RecurringTransaction from './recurring-transaction';
import gcloudKms from '../lib/gcloud-kms';
import * as crypto from 'crypto';
import { isStagingEnv } from '../lib/utils';
import {
  BankAccountSubtype,
  BankAccountType,
  BankingDataSource,
  MicroDeposit,
} from '@dave-inc/wire-typings';
import {
  BankAccountBalances,
  SUPPORTED_BANK_ACCOUNT_SUBTYPES,
  SUPPORTED_BANK_ACCOUNT_TYPE,
} from '../typings';
import { addBankingDaysForAch } from '../lib/banking-days';
import HeathClient from '../../src/lib/heath-client';
import { chain, find } from 'lodash';

export enum MicroDepositType {
  NotRequired = 'NOT_REQUIRED',
  Required = 'REQUIRED',
  Failed = 'FAILED',
  Completed = 'COMPLETED',
}

@DefaultScope({
  order: [['id', 'ASC']],
})
@Scopes({
  supported: {
    where: {
      type: SUPPORTED_BANK_ACCOUNT_TYPE,
      subType: { [Op.in]: SUPPORTED_BANK_ACCOUNT_SUBTYPES },
    },
  },
  bankOfDave: {
    include: [
      {
        model: () => BankConnection,
        where: {
          bankingDataSource: BankingDataSource.BankOfDave,
        },
      },
    ],
  },
})
@Table({
  paranoid: true,
  tableName: 'bank_account',
})
export default class BankAccount extends Model<BankAccount> {
  public static getSupportedAccountsByBankConnectionId(
    bankConnectionId: number,
  ): Bluebird<BankAccount[]> {
    return BankAccount.scope('supported').findAll({
      where: { bankConnectionId },
    });
  }

  public static getSupportedAccountsByUserId(userId: number): Bluebird<BankAccount[]> {
    return BankAccount.scope('supported').findAll({
      where: { userId },
      include: [
        { model: BankConnection, required: true },
        {
          model: PaymentMethod,
          as: 'defaultPaymentMethod',
        },
        Institution,
      ],
    });
  }

  public static getSupportedAccountsByUserNotDeletedOrDefault(user: User): Bluebird<BankAccount[]> {
    return BankAccount.scope('supported').findAll({
      where: {
        userId: user.id,
        [Op.or]: [{ deleted: { [Op.eq]: null } }, { id: user.defaultBankAccountId }],
      },
      paranoid: false,
      include: [
        { model: BankConnection, where: { deleted: { [Op.eq]: null } } },
        { model: PaymentMethod, as: 'defaultPaymentMethod' },
        Institution,
      ],
    });
  }

  public static getAccountByExternalId(externalId: string): Promise<BankAccount> {
    return BankAccount.findOne({
      where: { externalId },
    });
  }

  public static async getAccountByUserIdAndExternalId(
    userId: number,
    externalId: string,
  ): Promise<BankAccount> {
    const accounts = await BankAccount.findAll({
      where: { userId },
      paranoid: false,
    });

    const account = find(accounts, a => a.externalId.indexOf(externalId) !== -1);
    return account;
  }

  public static async getAccountAgeFromBankTransactionsByBankAccountId(
    bankAccountId: number,
    today?: Moment,
  ): Promise<number> {
    today = moment(today);

    const oldest = await HeathClient.getSingleBankTransaction(
      bankAccountId,
      {},
      {
        order: { transactionDate: SortOrder.ASC },
      },
    );

    if (oldest) {
      return today.diff(oldest.transactionDate, 'days');
    }

    return 0;
  }

  public static async encryptAccountNumber(account: string, routing: string) {
    return (await gcloudKms.encrypt(`${account}|${routing}`)).ciphertext;
  }

  public static hashAccountNumber(account: string, routing: string) {
    return crypto
      .createHash('sha256')
      .update(`${account}|${routing}`, 'utf8')
      .digest('hex');
  }

  @Column({
    autoIncrement: true,
    primaryKey: true,
    type: INTEGER,
  })
  public id: number;

  @ForeignKey(() => BankConnection)
  @Column({
    field: 'bank_connection_id',
    type: INTEGER,
  })
  public bankConnectionId: number;

  @BelongsTo(() => BankConnection)
  public bankConnection: BankConnection;
  public getBankConnection: (options?: FindOptions) => Promise<BankConnection>;

  @ForeignKey(() => Institution)
  @Column({
    field: 'institution_id',
    type: INTEGER,
  })
  public institutionId: number;

  @ForeignKey(() => PaymentMethod)
  @Column({
    field: 'default_payment_method_id',
    type: INTEGER,
  })
  public defaultPaymentMethodId: number;

  @BelongsTo(() => PaymentMethod)
  public defaultPaymentMethod: PaymentMethod;
  public getDefaultPaymentMethod: (options?: FindOptions) => Promise<PaymentMethod>;

  @Column({
    field: 'main_paycheck_recurring_transaction_id',
    type: INTEGER,
  })
  // ID of the RT in the (soon to be legacy) RecurringTransaction table
  public mainPaycheckRecurringTransactionId: number;

  @BelongsTo(() => RecurringTransaction, 'mainPaycheckRecurringTransactionId')
  public mainPaycheckRecurringTransaction: RecurringTransaction;
  public getMainPaycheckRecurringTransaction: () => Promise<RecurringTransaction>;

  @Column({
    field: 'ext_main_paycheck_recurring_transaction_uuid',
    type: STRING,
  })
  // ID of the RT in the Groundhog service
  public mainPaycheckRecurringTransactionUuid: string;

  @BelongsTo(() => Institution)
  public institution: Institution;
  public getInstitution: () => Institution;

  @ForeignKey(() => User)
  @Column({
    field: 'user_id',
    type: INTEGER,
  })
  public userId: number;

  @BelongsTo(() => User)
  public user: User;

  public getUser: (options?: FindOptions) => Promise<User>;

  @Column({
    type: STRING(265),
    field: 'account_number_aes256',
  })
  public accountNumberAes256: string;

  @Column({
    type: STRING(265),
    field: 'account_number',
  })
  public accountNumber: string;

  @Column({
    type: STRING(256),
    field: 'external_id',
  })
  public externalId: string;

  @Column({
    type: STRING(256),
    field: 'display_name',
  })
  public displayName: string;

  @Column({
    type: STRING(256),
    field: 'synapse_node_id',
  })
  public synapseNodeId: string;

  @Column({
    type: STRING(4),
    field: 'last_four',
  })
  public lastFour: string;

  @Column({
    type: DECIMAL(16, 2),
  })
  public current: number;

  @Column({
    type: DECIMAL(16, 2),
  })
  public available: number;

  @Column({
    type: ENUM('LOAN', 'DEPOSITORY', 'CREDIT'),
  })
  public type: BankAccountType;

  @Column({
    type: ENUM('NOT_REQUIRED', 'REQUIRED', 'FAILED', 'COMPLETED'),
    field: 'micro_deposit',
  })
  public microDeposit: MicroDeposit;

  @Column({
    type: DATE,
    field: 'micro_deposit_created',
  })
  public microDepositCreated: Moment;

  @Column({
    type: ENUM(
      'CHECKING',
      'PREPAID',
      'PREPAID_DEBIT',
      'CD',
      'CREDIT',
      'CREDIT CARD',
      'LINE OF CREDIT',
      'MONEY MARKET',
      'SAVINGS',
      'OVERDRAFT',
      'MORTGAGE',
      'STUDENT',
      'LOAN',
      'CONSUMER',
      'AUTO',
      'OTHER',
      'REWARDS',
      'HOME EQUITY',
    ),
  })
  public subtype: BankAccountSubtype;

  @Column({
    type: DATE,
    field: 'pre_approval_waitlist',
  })
  public preApprovalWaitlist: Moment;

  @Column({
    type: STRING(256),
    field: 'risepay_id',
  })
  public risepayId: string;

  @HasMany(() => Advance)
  public advances: Advance[];

  @HasMany(() => Payment)
  public payments: Payment[];

  @HasMany(() => RecurringTransaction)
  public recurringTransactions: RecurringTransaction[];

  @HasMany(() => PaymentMethod)
  public paymentMethods: PaymentMethod[];
  public getPaymentMethods: () => Promise<PaymentMethod[]>;

  @CreatedAt
  public created: Moment;

  @UpdatedAt
  public updated: Moment;

  @DeletedAt
  public deleted: Moment;

  public get hasAccountRouting() {
    return this.accountNumber ? true : false;
  }

  /**
   * @Deprecated use HeathClient.getBankTransactions
   * TODO: Remove this soon
   */
  public getBankTransactions(): Promise<BankTransaction[]> {
    return HeathClient.getBankTransactions(this.id);
  }

  public async isDaveBanking(): Promise<boolean> {
    const connection = this.bankConnection || (await this.getBankConnection());
    return connection && connection.isDaveBanking();
  }

  public async isDaveSpendingAccount(): Promise<boolean> {
    return (await this.isDaveBanking()) && this.subtype === BankAccountSubtype.Checking;
  }

  public async hasValidCredentials(): Promise<boolean> {
    const connection = this.bankConnection || (await this.getBankConnection());
    return connection && connection.hasValidCredentials;
  }

  /**
   * Determines if the account is flagged as primary on the bank connection
   *
   * @returns {Promise<boolean>}
   */
  public async isPrimaryAccount(): Promise<boolean> {
    const connection = this.bankConnection || (await this.getBankConnection());
    return connection && connection.primaryBankAccountId === this.id;
  }

  public microDepositComplete() {
    if (this.microDeposit === MicroDeposit.COMPLETED) {
      return true;
    }
    if (!this.hasAccountRouting) {
      return false;
    }
    if ([MicroDeposit.REQUIRED, MicroDeposit.FAILED].includes(this.microDeposit)) {
      return false;
    }
    return true;
  }

  public async forceMicroDepositComplete() {
    await this.update({ microDeposit: MicroDeposit.COMPLETED });
  }

  public isSupported() {
    return (
      this.type === SUPPORTED_BANK_ACCOUNT_TYPE &&
      SUPPORTED_BANK_ACCOUNT_SUBTYPES.includes(this.subtype)
    );
  }

  public toJSON() {
    return {
      ...super.toJSON(),
      isSupported: this.isSupported(),
    };
  }

  public async getAccountAgeFromTransactions(today?: Moment): Promise<number> {
    return BankAccount.getAccountAgeFromBankTransactionsByBankAccountId(this.id, today);
  }

  public async findACHMicroDeposit(): Promise<Array<[number, number]>> {
    const start = this.microDepositCreated.format('YYYY-MM-DD');
    const end = moment(this.microDepositCreated)
      .add(5, 'days')
      .format('YYYY-MM-DD');
    const transactions = await HeathClient.getBankTransactions(this.id, {
      transactionDate: { gte: start, lte: end },
      amount: { gte: 0.01, lte: 0.1 },
    });

    const pattern = /Dave/i;
    return chain(transactions)
      .groupBy('displayName')
      .filter(bts => pattern.test(bts[0]?.displayName))
      .map(bts => bts.map(bt => bt.amount))
      .filter(a => a.length === 2)
      .map((a: number[]): [number, number] => [a[0], a[1]])
      .value();
  }

  public async updateAccountRouting(account: string, routing: string) {
    if (!account) {
      throw new InvalidParametersError('Need account number');
    }
    if (!routing) {
      throw new InvalidParametersError('Need account number');
    }

    const accountNumber = BankAccount.hashAccountNumber(account, routing);
    const accountWithSameNumber = await BankAccount.findOne({ where: { accountNumber } });
    if (accountWithSameNumber && accountWithSameNumber.id !== this.id && !isStagingEnv()) {
      throw new ConflictError('Duplicate accounts found', { data: { accountWithSameNumber } });
    }
    const accountNumberAes256 = await BankAccount.encryptAccountNumber(account, routing);
    await this.update({ accountNumber, accountNumberAes256 });
  }

  public eraseAccountRouting() {
    return this.update({ accountNumber: null, accountNumberAes256: null });
  }

  public get balances(): BankAccountBalances {
    return {
      available: this.available,
      current: this.current,
    };
  }
  public isReadyForMicroDepositManualVerification(at: Moment = moment()) {
    const shouldCheckVerificationDate =
      MicroDeposit.REQUIRED === this.microDeposit || MicroDeposit.FAILED === this.microDeposit;

    if (shouldCheckVerificationDate) {
      const microDepositReadyDate = addBankingDaysForAch(this.microDepositCreated);
      return microDepositReadyDate.isBefore(at);
    }
    return false;
  }
}
