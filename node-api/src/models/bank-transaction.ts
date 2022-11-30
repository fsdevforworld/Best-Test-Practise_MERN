import { Moment } from 'moment';
import { result } from 'lodash';
import {
  BOOLEAN,
  DATEONLY,
  DECIMAL,
  ENUM,
  INTEGER,
  JSON as SQLJSON,
  Op,
  STRING,
  Transaction,
} from 'sequelize';
import {
  BelongsTo,
  Column,
  CreatedAt,
  DefaultScope,
  ForeignKey,
  Model,
  Table,
  UpdatedAt,
} from 'sequelize-typescript';
import User from './user';
import * as Bluebird from 'bluebird';
import { moment } from '@dave-inc/time-lib';
import { bulkInsertAndRetry } from '../lib/sequelize-helpers';
import { serializeDate } from '../serialization';
import BankAccount from './bank-account';
import MerchantInfo from './merchant-info';
import { formatDisplayName } from '../lib/format-transaction-name';
import { ISerializable } from '../typings';
import {
  BankAccountSubtype,
  BankAccountType,
  BankTransactionResponse,
  MerchantInfoResponse,
} from '@dave-inc/wire-typings';

const EXTERNAL_NAME_RETURNED = [
  '% nsf% ',
  '%(nsf)%',
  '%returned item%',
  '%insufficient fund%',
  '%unpaid%',
  '%returned check%',
  '%returned check%',
  '%returned ck%',
  '%returned fee%',
];

@DefaultScope(() => ({
  order: [['transactionDate', 'DESC']],
  include: [MerchantInfo],
}))
@Table({
  tableName: 'bank_transaction',
})
export default class BankTransaction extends Model<BankTransaction>
  implements ISerializable<BankTransactionResponse> {
  public static deleteByExternalIdForBankAccount(externalId: string, bankAccountId: number) {
    return this.sequelize.transaction(
      { isolationLevel: Transaction.ISOLATION_LEVELS.READ_UNCOMMITTED },
      transaction => {
        return BankTransaction.destroy({
          where: {
            externalId,
            bankAccountId,
          },
          limit: 1,
          transaction,
        });
      },
    );
  }

  public static getPaybackByBankAccountId(
    bankAccountId: number,
    start: string,
    stop: string,
  ): Bluebird<BankTransaction[]> {
    return BankTransaction.findAll({
      where: {
        transactionDate: { [Op.between]: [start, stop] },
        bankAccountId,
        [Op.or]: [
          { displayName: { [Op.like]: '%Dave, Inc%' } },
          { displayName: { [Op.like]: '%Dave Inc%' } },
        ],
        amount: { [Op.lt]: -1 },
        pending: false,
      },
    });
  }

  /**
   * Counts all returned / overdraft / insufficient funds in bank account's transaction history
   *
   * @param {number} bankAccountId
   * @param {moment.Moment} dateBack
   * @returns {Bluebird<number>}
   */
  public static countReturned(bankAccountId: number, dateBack: Moment): Bluebird<number> {
    return BankTransaction.count({
      where: {
        bankAccountId,
        externalName: {
          [Op.notLike]: '%OVERDRAFT%',
        },
        amount: {
          [Op.and]: [{ [Op.lt]: 0 }, { [Op.notIn]: [-34, -30, -36] }],
        },
        transactionDate: { [Op.gt]: dateBack },
        [Op.or]: EXTERNAL_NAME_RETURNED.map(name => ({ externalName: { [Op.like]: name } })),
      },
    });
  }

  public static async getRecentByBankAccountId(
    bankAccountId: number,
    options: {
      start: Moment | string;
      end?: Moment | string;
    },
  ): Promise<BankTransaction[]> {
    const { start, end = moment() } = options;
    return BankTransaction.findAll({
      where: {
        bankAccountId,
        transactionDate: {
          [Op.and]: [{ [Op.gte]: start }, { [Op.lte]: end }],
        },
      },
    });
  }

  public static getByDisplayName(
    bankAccountId: number,
    displayName: string,
    limit: number = 4,
  ): Bluebird<BankTransaction[]> {
    return BankTransaction.findAll({
      where: {
        bankAccountId,
        displayName,
      },
      limit,
    });
  }

  public static getByBankAccountId(
    bankAccountId: number,
    extra: any = {},
  ): Bluebird<BankTransaction[]> {
    return BankTransaction.findAll({
      where: {
        bankAccountId,
        ...extra,
      },
    });
  }

  public static async bulkInsertAndRetry(
    transactions: Array<Partial<BankTransaction>>,
  ): Promise<BankTransaction[]> {
    return bulkInsertAndRetry(BankTransaction, transactions);
  }

  @Column({
    autoIncrement: true,
    primaryKey: true,
    type: INTEGER,
  })
  public id: number;

  @CreatedAt
  public created: Date;

  @UpdatedAt
  public updated: Date;

  @ForeignKey(() => BankAccount)
  @Column({
    field: 'bank_account_id',
    type: INTEGER,
  })
  public bankAccountId: number;

  @BelongsTo(() => BankAccount)
  public bankAccount: BankAccount;

  @ForeignKey(() => User)
  @Column({
    field: 'user_id',
    type: INTEGER,
  })
  public userId: number;

  @BelongsTo(() => User)
  public user: User;

  @Column({
    type: STRING(256),
    field: 'external_id',
  })
  public externalId: string;

  @Column({
    type: ENUM('LOAN', 'DEPOSITORY', 'CREDIT'),
    field: 'account_type',
  })
  public accountType: BankAccountType;

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
    field: 'account_subtype',
  })
  public accountSubtype: BankAccountSubtype;

  @Column({
    type: STRING(512),
    field: 'pending_external_name',
  })
  public pendingExternalName: string;

  @Column({
    type: STRING(512),
    field: 'pending_display_name',
  })
  public pendingDisplayName: string;

  @Column({
    type: STRING(512),
    field: 'external_name',
  })
  public externalName: string;

  @Column({
    type: STRING(512),
    field: 'display_name',
  })
  public displayName: string;

  @Column({
    type: DECIMAL(16, 2),
  })
  public amount: number;

  @Column({
    type: DATEONLY,
    field: 'transaction_date',
  })
  public transactionDate: Moment;

  @Column({
    type: BOOLEAN,
  })
  public pending: boolean;

  @Column({
    type: STRING(256),
  })
  public address: string;

  @Column({
    type: STRING(256),
  })
  public city: string;

  @Column({
    type: STRING(256),
  })
  public state: string;

  @Column({
    type: STRING(10),
    field: 'zip_code',
  })
  public zipCode: string;

  @Column({
    type: SQLJSON,
    field: 'plaid_category',
  })
  public plaidCategory: any;

  @Column({
    type: STRING(32),
    field: 'plaid_category_id',
  })
  public plaidCategoryId: string;

  @Column({
    type: STRING(256),
    field: 'reference_number',
  })
  public referenceNumber: string;

  @Column({
    type: STRING(256),
    field: 'ppd_id',
  })
  public ppdId: string;

  @Column({
    type: STRING(256),
    field: 'payee_name',
  })
  public payeeName: string;

  @ForeignKey(() => MerchantInfo)
  @Column({
    type: INTEGER,
    field: 'merchant_info_id',
  })
  public merchantInfoId: number;

  @BelongsTo(() => MerchantInfo)
  public merchantInfo: MerchantInfo;

  public toJSON() {
    return {
      ...(super.toJSON() as BankTransaction),
      merchantInfo: this.merchantInfo ? this.merchantInfo.toJSON() : null,
      transactionDate: this.transactionDate.format('YYYY-MM-DD'),
      created: moment(this.created),
      updated: moment(this.created), // TODO: Probably a bug, fix me later when time allows
    };
  }

  public serialize(): BankTransactionResponse {
    return {
      id: this.id,
      bankAccountId: this.bankAccountId,
      externalId: this.externalId,
      externalName: this.externalName,
      displayName: formatDisplayName(this.displayName),
      amount: this.amount,
      pending: this.pending,
      address: this.address,
      city: this.city,
      state: this.state,
      zipCode: this.zipCode,
      plaidCategory: this.plaidCategory,
      plaidCategoryId: this.plaidCategoryId,
      merchantInfo: result<MerchantInfoResponse>(this, 'merchantInfo.serialize', null),
      transactionDate: serializeDate(this.transactionDate, 'YYYY-MM-DD'),
      created: serializeDate(this.created),
      updated: serializeDate(this.updated),
    };
  }
}
