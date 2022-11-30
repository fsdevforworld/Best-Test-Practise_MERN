import { Moment } from '@dave-inc/time-lib';
import {
  BelongsToGetAssociationMixin,
  BOOLEAN,
  DATE,
  ENUM,
  FindOptions,
  INTEGER,
  Op,
  STRING,
  WhereOptions,
} from 'sequelize';
import {
  BelongsTo,
  Column,
  CreatedAt,
  DeletedAt,
  ForeignKey,
  HasMany,
  Model,
  Table,
  UpdatedAt,
} from 'sequelize-typescript';

import Advance from './advance';
import BankAccount from './bank-account';
import BankConnectionTransition from './bank-connection-transition';
import Institution from './institution';
import Payment from './payment';
import PaymentMethod from './payment-method';
import RecurringTransaction from './recurring-transaction';
import User from './user';
import * as Bluebird from 'bluebird';
import { flatten } from 'lodash';
import { BankingDataSource } from '@dave-inc/wire-typings';
import logger from '../lib/logger';

@Table({
  deletedAt: 'deleted',
  paranoid: true,
  tableName: 'bank_connection',
})
export default class BankConnection extends Model<BankConnection> {
  public static getOneByExternalId(externalId: string): Bluebird<BankConnection> {
    return BankConnection.findOne({ where: { externalId } });
  }

  public static async getByUserIdWithInstitution(userId: number, onlyDeleted: boolean = false) {
    const connections = await BankConnection.findAll({
      include: [{ model: Institution }],
      where: { userId, deleted: onlyDeleted ? { [Op.not]: null } : null },
      paranoid: onlyDeleted ? false : true,
    });
    return connections.map(connection => {
      return {
        ...connection.toJSON(),
        id: connection.id,
        institution: undefined,
        displayName: connection.institution.displayName,
        plaidInstitutionId: connection.institution.plaidInstitutionId,
        primaryColor: connection.institution.primaryColor,
        logo: connection.institution.logo,
        balanceIncludesPending: connection.institution.balanceIncludesPending,
      };
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
  public deleted: Moment;

  @ForeignKey(() => Institution)
  @Column({
    field: 'institution_id',
    type: INTEGER,
  })
  public institutionId: number;

  @BelongsTo(() => Institution)
  public institution: Institution;
  public getInstitution: BelongsToGetAssociationMixin<Institution>;

  @ForeignKey(() => User)
  @Column({
    field: 'user_id',
    type: INTEGER,
  })
  public userId: number;

  @BelongsTo(() => User)
  public user: User;
  public getUser: () => Promise<User>;

  @Column({
    type: STRING(256),
    field: 'external_id',
  })
  public externalId: string;

  @ForeignKey(() => BankAccount)
  @Column({
    field: 'primary_bank_account_id',
    type: INTEGER,
  })
  public primaryBankAccountId: number;

  @Column({
    type: STRING(256),
    field: 'auth_token',
  })
  public authToken: string;

  @Column({
    type: BOOLEAN,
    field: 'has_valid_credentials',
  })
  public hasValidCredentials: boolean;

  @Column({
    type: BOOLEAN,
    field: 'has_transactions',
  })
  public hasTransactions: boolean;

  @Column({
    type: DATE,
    field: 'initial_pull',
  })
  public initialPull: Moment;

  // Plaid specific. This is when we were able to access more than 30 days of transaction data.
  @Column({
    type: DATE,
    field: 'historical_pull',
  })
  public historicalPull: Moment;

  @Column({
    type: DATE,
    field: 'last_pull',
  })
  public lastPull: Moment;

  @Column({
    type: STRING(256),
    field: 'banking_data_source_error_code',
  })
  public bankingDataSourceErrorCode: string;

  @Column({
    type: DATE,
    field: 'banking_data_source_error_at',
  })
  public bankingDataSourceErrorAt: Moment;

  @Column({
    type: ENUM('PLAID', 'BANK_OF_DAVE'),
    field: 'banking_data_source',
    defaultValue: 'PLAID',
  })
  public bankingDataSource: BankingDataSource;

  @HasMany(() => BankAccount)
  public bankAccounts: BankAccount[];
  public getBankAccounts: (options?: FindOptions) => Promise<BankAccount[]>;

  @HasMany(() => BankConnectionTransition, { foreignKey: 'toBankConnectionId', sourceKey: 'id' })
  public toBankConnectionTransitions: BankConnectionTransition[];
  public getToBankConnectionTransitions: () => Promise<BankConnectionTransition[]>;

  public getPrimaryBankAccount() {
    return BankAccount.findByPk(this.primaryBankAccountId);
  }

  public async softDelete() {
    const query = {
      where: { bankConnectionId: this.id },
      include: [
        { model: PaymentMethod, as: 'paymentMethods' },
        {
          model: RecurringTransaction,
          as: 'recurringTransactions',
        },
      ],
    };

    const bankAccounts = await BankAccount.findAll(query);
    const paymentMethods = flatten(bankAccounts.map(bankAccount => bankAccount.paymentMethods));
    const recurringTransactions = flatten(
      bankAccounts.map(bankAccount => bankAccount.recurringTransactions),
    );

    return this.sequelize.transaction(t => {
      return Bluebird.all([
        Bluebird.map(bankAccounts, bankAccount => {
          bankAccount.set({
            synapseNodeId: null,
            accountNumber: null,
            externalId: `deleted-${bankAccount.id}-${bankAccount.externalId}`,
          });

          return bankAccount.destroy({ transaction: t });
        }),
        // Remove associated payment methods
        Bluebird.map(paymentMethods, paymentMethod => paymentMethod.destroy({ transaction: t })),
        // Remove associated recurring transactions
        Bluebird.map(recurringTransactions, recTrxn => recTrxn.destroy({ transaction: t })),
        // Prefix auth token and external id with deleted so same connection can reconnect
        (async () => {
          const deletedRegex = /deleted-*/;
          if (!deletedRegex.test(this.authToken)) {
            this.set('authToken', `deleted-${this.id}-${this.authToken}`);
          }
          if (!deletedRegex.test(this.externalId)) {
            this.set('externalId', `deleted-${this.id}-${this.externalId}`);
          }
          await this.destroy({ transaction: t });
        })(),
      ]);
    });
  }

  public async hardDelete() {
    try {
      await this.sequelize.transaction(async transaction => {
        // if the user does NOT have any subscription payments or advances, do a hard delete
        await BankAccount.destroy({
          force: true,
          where: { bankConnectionId: this.id },
          transaction,
        });
        await this.destroy({ force: true, transaction });
      });
    } catch (err) {
      // if the user has subscription payments or advances, do a soft delete
      if (err.name === 'SequelizeForeignKeyConstraintError') {
        await this.softDelete();
      } else {
        throw err;
      }
    }
  }

  public requiresPaymentMethodForAdvance(): boolean {
    switch (this.bankingDataSource) {
      case BankingDataSource.Plaid:
      case BankingDataSource.Mx:
        return true;
      case BankingDataSource.BankOfDave:
        return false;
      default:
        logger.warn('Unsupported banking data source in requires payment check', {
          bankingDataSource: this.bankingDataSource,
        });
        return false;
    }
  }

  public supportsUnlimitedBalanceRefresh(): boolean {
    switch (this.bankingDataSource) {
      case BankingDataSource.Plaid:
      case BankingDataSource.Mx:
        return false;
      case BankingDataSource.BankOfDave:
        return true;
      default:
        logger.warn('Unsupported banking data source in unlimited balance refresh check', {
          bankingDataSource: this.bankingDataSource,
        });
        return false;
    }
  }

  public isDaveBanking(): boolean {
    return this.bankingDataSource === BankingDataSource.BankOfDave;
  }

  /**
   * Determines if bank connection has any associated payments
   * with option to filter via where query options
   *
   * @param {WhereOptions} filters
   * @returns {Promise<boolean>}
   */
  public async hasPayments(filters: WhereOptions = {}): Promise<boolean> {
    return Boolean(
      await Payment.findOne({
        where: filters,
        include: [
          {
            model: BankAccount,
            where: { bankConnectionId: this.id },
            required: true,
          },
        ],
      }),
    );
  }

  /**
   * Determines if bank connection has any associated advances
   * with option to filter via where query options
   *
   * @param {WhereOptions} filters
   * @returns {Promise<boolean>}
   */
  public async hasAdvances(filters: WhereOptions = {}): Promise<boolean> {
    return Boolean(
      await Advance.findOne({
        where: filters,
        include: [
          {
            model: BankAccount,
            where: { bankConnectionId: this.id },
            required: true,
          },
        ],
      }),
    );
  }
}
