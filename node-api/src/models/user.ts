import { moment } from '@dave-inc/time-lib';
import { ExternalTransactionStatus, UserRole as RoleName } from '@dave-inc/wire-typings';
import * as bcrypt from 'bcrypt';
import * as Bluebird from 'bluebird';
import { get, isString } from 'lodash';
import { Moment } from 'moment';
import {
  BOOLEAN,
  DATE,
  DATEONLY,
  DECIMAL,
  HasManyGetAssociationsMixin,
  INTEGER,
  JSON as SQLJSON,
  Op,
  QueryTypes,
  STRING,
  Transaction,
} from 'sequelize';
import {
  BelongsTo,
  BelongsToMany,
  Column,
  CreatedAt,
  DeletedAt,
  HasMany,
  Model,
  Table,
  UpdatedAt,
} from 'sequelize-typescript';
import { ulid } from 'ulid';
import { InvalidParametersError } from '../lib/error';
import { ACTIVE_TIMESTAMP } from '../lib/sequelize';
import { shallowMungeObjToCase, toE164, validateE164 } from '../lib/utils';
import AdminComment from './admin-comment';
import Advance from './advance';
import Alert from './alert';
import AuditLog from './audit-log';
import BankAccount from './bank-account';
import BankConnection from './bank-connection';
import BankTransaction from './bank-transaction';
import Config from './config';
import CreditPopCode from './credit-pop-code';
import EmailVerification from './email-verification';
import EmpyrEvent from './empyr-event';
import FraudAlert from './fraud-alert';
import FraudRule from './fraud-rule';
import Incident from './incident';
import MembershipPause from './membership-pause';
import PasswordHistory from './password-history';
import Payment from './payment';
import PaymentMethod from './payment-method';
import Reimbursement from './reimbursement';
import RewardsLedger from './rewards-ledger';
import Role from './role';
import SubscriptionBilling from './subscription-billing';
import SynapsepayDocument from './synapsepay-document';
import UserAddress from './user-address';
import UserIncident from './user-incident';
import UserIpAddress from './user-ip-address';
import UserRole from './user-role';
import UserSession from './user-session';

export enum VerificationCodeDeliveryMethod {
  EMAIL = 'email',
  PHONE = 'phone',
}

// Midnight in PDT
export const PASSWORD_UPDATE_CUTOFF_DATE = new Date('2020-06-29T07:00:00Z');

@Table({
  paranoid: true,
  tableName: 'user',
})
export default class User extends Model<User> {
  public static findOneByPhoneNumber(phoneNumber: string, paranoid = true): Promise<User> {
    return User.findOne({
      where: this.getSequalizeWhereObjectForFindByPhone(phoneNumber),
      order: [['deleted', 'DESC']],
      paranoid,
    });
  }

  public static findOneByEmail(email: string, paranoid = true): Promise<User> {
    return User.findOne({
      where: { email },
      order: [['created', 'DESC']],
      paranoid,
    });
  }

  public static findOneByPhoneNumberOrEmail({
    phoneNumber,
    email,
    paranoid = true,
  }: {
    phoneNumber?: string;
    email?: string;
    paranoid?: boolean;
  }): Promise<User> {
    if (phoneNumber) {
      return this.findOneByPhoneNumber(toE164(phoneNumber), paranoid);
    } else {
      return this.findOneByEmail(email, paranoid);
    }
  }

  public static async getDueSubscribers(): Promise<Array<Partial<User>>> {
    const formattedTime = moment().format('YYYY-MM-DD HH:mm:ss');
    const query = `
      SELECT user.id,
             user.deleted,
             user.is_subscribed,
             user.subscription_start,
             user.first_name,
             user.last_name,
             user.default_bank_account_id
      FROM user
             INNER JOIN subscription_billing b ON user.id = b.user_id AND
                                                  b.start <= ? AND
                                                  b.end >= ? AND
                                                  b.amount > 0 AND
                                                  b.deleted IS NULL
             LEFT JOIN subscription_payment_line_item li ON li.subscription_billing_id = b.id
             LEFT JOIN subscription_payment p ON p.id = li.subscription_payment_id AND
                                                 p.status IN ('COMPLETED', 'PENDING', 'UNKNOWN')
      WHERE user.deleted > NOW()
        AND p.id IS NULL
    `;

    const results = await this.sequelize.query(query, {
      type: QueryTypes.SELECT,
      replacements: [formattedTime, formattedTime],
    });
    return results.map((row: any) => shallowMungeObjToCase(row, 'camelCase'));
  }

  public static async getOrCreate(
    phoneNumber: string,
    deviceId: string,
    deviceType: string,
    firstName?: string,
    lastName?: string,
  ): Promise<{ created: boolean; user: User; token: string }> {
    const [user, created] = await this.findOrCreate({
      where: this.getSequalizeWhereObjectForFindByPhone(phoneNumber),
      defaults: {
        phoneNumber,
        firstName,
        lastName,
      },
    });

    const token = await this.getSessionToken(user.id, deviceId, deviceType);

    return { created, user, token };
  }

  public static async getSessionToken(
    userId: number,
    deviceId: string,
    deviceType: string,
  ): Promise<string> {
    const userSession = await this.getSession(userId, deviceId, deviceType);
    return userSession.token;
  }

  public static async getSession(
    userId: number,
    deviceId: string,
    deviceType: string,
    create: boolean = true,
  ): Promise<UserSession | null> {
    let currentSession = await UserSession.findOne({
      where: { [Op.and]: [{ userId }, { deviceId }] },
    });
    if (!currentSession && !create) {
      return null;
    }

    if (!currentSession) {
      currentSession = await UserSession.create({ userId, deviceId, deviceType });
    }

    return currentSession;
  }

  public static getByFraudRuleId(fraudRuleId: number, transaction: Transaction): Bluebird<User[]> {
    return User.findAll({
      include: [
        {
          model: FraudAlert,
          required: true,
          include: [
            {
              model: FraudRule,
              required: true,
              where: {
                id: fraudRuleId,
              },
            },
          ],
        },
      ],
      transaction,
    });
  }

  public static async softDeleteUserAccount(
    user: User,
    overrideSixtyDayDelete = false,
  ): Promise<any> {
    const phoneNumber = user.e164PhoneNumber();
    const query = `
        UPDATE user
        SET deleted                   = current_timestamp,
            phone_number              = concat(:phoneNumber, "-deleted-", unix_timestamp()),
            override_sixty_day_delete = :overrideSixtyDayDelete
        WHERE id = :userId
    `;
    const result = await this.sequelize.query(query, {
      replacements: { phoneNumber, userId: user.id, overrideSixtyDayDelete },
    });
    return result;
  }

  private static getSequalizeWhereObjectForFindByPhone(phoneNumber: string) {
    return { phoneNumber: { [Op.like]: `${phoneNumber}%` } };
  }

  @Column({
    autoIncrement: true,
    primaryKey: true,
    type: INTEGER,
  })
  public id: number;

  @Column({
    type: INTEGER,
    field: 'legacy_id',
  })
  public legacyId: number;

  @Column({
    type: STRING(26),
    field: 'user_ulid',
    unique: 'unique_user_ulid',
  })
  public userUlid: string;

  @Column({
    type: STRING(32),
    field: 'phone_number',
    validate: {
      isPhoneNumber(value: string) {
        // sometimes phone numbers are set to '+11234567890-deleted'
        value = value.split('-')[0];
        if (validateE164(value)) {
          return;
        } else {
          throw new Error('Number is not valid E164');
        }
      },
    },
  })
  public phoneNumber: string;

  @Column({
    type: STRING(32),
    field: 'synapsepay_id',
  })
  public synapsepayId: string;

  @Column({
    type: STRING(256),
    field: 'risepay_customer_id',
  })
  public risepayCustomerId: string;

  @Column({
    type: STRING(256),
    field: 'risepay_address_id',
  })
  public risepayAddressId: string;

  @Column({
    type: STRING(256),
  })
  public email: string;

  @Column({
    type: STRING(256),
    field: 'first_name',
  })
  public firstName: string;

  @Column({
    type: STRING(256),
    field: 'last_name',
  })
  public lastName: string;

  @Column({
    type: SQLJSON,
    defaultValue: () => {
      return {};
    },
  })
  public settings: any;

  @Column({
    type: DATEONLY,
  })
  public birthdate: Moment;

  @Column({
    type: STRING(256),
    field: 'address_line1',
  })
  public addressLine1: string;

  @Column({
    type: STRING(256),
    field: 'address_line2',
  })
  public addressLine2: string;

  @Column({
    type: STRING(256),
  })
  public city: string;

  @Column({
    type: STRING(256),
  })
  public state: string;

  @Column({
    type: STRING(12),
    field: 'zip_code',
  })
  public zipCode: string;

  @Column({
    type: STRING(265),
  })
  public ssn: string;

  @Column({
    type: STRING(265),
  })
  public pin: string;

  @Column({
    type: BOOLEAN,
    field: 'is_subscribed',
  })
  public isSubscribed: boolean;

  @Column({
    type: DATEONLY,
    field: 'subscription_start',
  })
  public subscriptionStart: Moment;

  @Column({
    type: DECIMAL(16, 2),
    field: 'subscription_fee',
  })
  public subscriptionFee: number;

  @Column({
    type: INTEGER,
    field: 'default_bank_account_id',
  })
  public defaultBankAccountId: number;

  @Column({
    type: SQLJSON,
    field: 'underwriting_override',
  })
  public underwritingOverride: any;

  @Column({
    type: STRING(16),
  })
  public gender: string;

  @Column({
    type: STRING(256),
    field: 'profile_image',
  })
  public profileImage: string;

  @Column({
    type: STRING(256),
    field: 'fcm_token',
  })
  public fcmToken: string;

  @Column({
    type: BOOLEAN,
    field: 'email_verified',
  })
  public emailVerified: boolean;

  @Column({
    type: DATE,
    field: 'last_active',
  })
  public lastActive: Moment;

  @Column({
    type: BOOLEAN,
    field: 'allow_duplicate_card',
  })
  public allowDuplicateCard: boolean;

  @Column({
    type: BOOLEAN,
  })
  public fraud: boolean;

  @Column({
    type: BOOLEAN,
  })
  public unsubscribed: boolean;

  @Column({
    type: BOOLEAN,
    field: 'bypass_ml',
  })
  public bypassML: boolean;

  @Column({
    type: DATE,
    field: 'used_two_months_free',
  })
  public usedTwoMonthsFree: Moment;

  @Column({
    type: BOOLEAN,
    field: 'override_sixty_day_delete',
  })
  public overrideSixtyDayDelete: boolean;

  @Column({
    type: STRING(256),
    field: 'license_image',
  })
  public licenseImage: string;

  @Column({
    type: STRING(256),
    field: 'secondary_email',
  })
  public secondaryEmail: string;

  @Column({
    type: INTEGER,
    field: 'empyr_user_id',
  })
  public empyrUserId: number;

  @Column({
    type: STRING(50),
    field: 'mx_user_id',
  })
  public mxUserId: string;

  /* The following three fields are MySQL virtual columns.
   * We aren't using the sequelize VIRTUAL type
   * because that won't let us take advantage
   * of the fact that these are indexed columns.
   * Sequelize virtual columns can't be indexed.
   */
  @Column({
    type: STRING,
    field: 'lower_first_name',
    // overwrite setter not to do anything because this is a virtual column
    set: () => null,
  })
  public lowerFirstName: string;

  @Column({
    type: STRING,
    field: 'lower_last_name',
    set: () => null,
  })
  public lowerLastName: string;

  @Column({
    type: STRING,
    field: 'lower_email',
    set: () => null,
  })
  public lowerEmail: string;

  @Column({
    type: STRING,
    field: 'lower_full_name',
    set: () => null,
  })
  public lowerFullName: string;

  @Column({
    type: STRING(64),
  })
  public password: string;

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

  @HasMany(() => AdminComment)
  public adminComments: AdminComment[];

  @HasMany(() => Advance)
  public advances: Advance[];
  public getAdvances: () => Promise<Advance[]>;

  @HasMany(() => Alert)
  public alerts: Alert[];

  @HasMany(() => AuditLog)
  public auditLogs: AuditLog[];

  @HasMany(() => BankAccount)
  public bankAccounts: BankAccount[];

  @BelongsTo(() => BankAccount, 'defaultBankAccountId')
  public defaultBankAccount: BankAccount;
  public getDefaultBankAccount: () => Promise<BankAccount>;

  @HasMany(() => BankConnection)
  public bankConnections: BankConnection[];
  public getBankConnections: () => Promise<BankConnection[]>;

  @HasMany(() => FraudAlert)
  public fraudAlerts: FraudAlert[];
  public getFraudAlerts: () => Promise<FraudAlert[]>;

  @HasMany(() => SubscriptionBilling)
  public subscriptionBillings: SubscriptionBilling[];
  public getSubscriptionBillings: () => Promise<SubscriptionBilling[]>;

  @HasMany(() => BankTransaction)
  public bankTransactions: BankTransaction[];

  @HasMany(() => MembershipPause, {
    scope: {
      unpaused_at: ACTIVE_TIMESTAMP,
    },
  })
  public membershipPauses: MembershipPause[];
  public getMembershipPauses: () => Promise<MembershipPause[]>;

  @HasMany(() => Payment)
  public payments: Payment[];
  public getPayments: HasManyGetAssociationsMixin<Payment>;

  @HasMany(() => PaymentMethod)
  public paymentMethods: PaymentMethod[];

  @HasMany(() => Reimbursement)
  public reimbursements: Reimbursement[];

  @HasMany(() => UserIpAddress)
  public userIpAddresses: UserIpAddress[];

  @HasMany(() => EmpyrEvent)
  public empyrEvents: EmpyrEvent[];

  @HasMany(() => RewardsLedger)
  public rewards: RewardsLedger[];

  @HasMany(() => SynapsepayDocument)
  public synapsepayDocuments: SynapsepayDocument[];
  public getSynapsepayDocuments: () => Promise<SynapsepayDocument[]>;

  @HasMany(() => UserSession)
  public userSessions: UserSession[];

  @HasMany(() => CreditPopCode)
  public creditPopCodes: CreditPopCode[];
  public getCreditPopCodes: () => Promise<CreditPopCode[]>;

  @HasMany(() => EmailVerification)
  public emailVerifications: EmailVerification[];

  @HasMany(() => PasswordHistory)
  public passwordHistory: PasswordHistory[];
  public getPasswordHistory: () => Promise<PasswordHistory[]>;

  @HasMany(() => UserAddress)
  public userAddresses: UserAddress[];
  public getUserAddresses: HasManyGetAssociationsMixin<UserAddress>;

  @BelongsToMany(
    () => Incident,
    () => UserIncident,
  )
  public incidents: Incident[];

  @BelongsToMany(
    () => Role,
    () => UserRole,
    'user_id',
    'role_id',
  )
  public roles: Role[];
  public getRoles: () => Promise<Role[]>;
  public setRoles: (roles: Role[]) => Promise<Role[]>;
  public addRole: (role: Role) => Promise<User>;

  // This checks if the user has ANY of the passed roles
  public async hasRoles(roleNames: RoleName[]): Promise<boolean> {
    const userRoleNames = await this.getRoleNames();
    return userRoleNames.some(userRoleName => roleNames.includes(userRoleName));
  }

  public async getRoleNames(): Promise<RoleName[]> {
    const roles = this.roles || (await this.getRoles());
    return roles.map(role => role.name);
  }

  public isDeletedFor60Days(): boolean {
    const daysDeleted = this.isSoftDeleted() ? moment().diff(moment(this.deleted), 'days') : null;
    return daysDeleted !== null && daysDeleted >= 60;
  }

  public isActive(): boolean {
    return !this.isSoftDeleted();
  }

  public async isPaused(): Promise<boolean> {
    const membershipPause = await this.getCurrentMembershipPause();
    return Boolean(membershipPause && membershipPause.isActive());
  }

  public async getCurrentMembershipPause(): Promise<MembershipPause> {
    const [currentPause] = await this.getMembershipPauses();
    return currentPause;
  }

  public async setPassword(password: string) {
    // Must have 1 lowercase character, 1 uppercase character, 1 number, and 1 special character.
    const hasDigit = password.match(/\d/);
    const hasLowercase = password.match(/[a-z]/);
    const hasUppercase = password.match(/[A-Z]/);
    const hasSpecial = password.match(/[ !@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?`~]/);
    const hasRequiredCharacters = hasDigit && hasLowercase && hasUppercase && hasSpecial;

    // Check additional requirements from the database
    const requirementsConfig = await Config.findOne({ where: { key: 'PASSWORD_REQUIREMENTS' } });
    const minPasswordLength = get(requirementsConfig, 'value.minLength', 8);

    // Ensure this isn't one of the last three user passwords
    const passwordHistory = await PasswordHistory.findAll({
      where: {
        userId: this.id,
      },
      limit: 3,
      order: [['id', 'DESC']],
    });

    for (const previousPassword of passwordHistory) {
      const isMatch = await bcrypt.compare(password, previousPassword.password);
      if (isMatch) {
        throw new InvalidParametersError('Cannot use one of your previous three passwords');
      }
    }

    const isValidPassword =
      isString(password) &&
      hasRequiredCharacters &&
      password.length >= minPasswordLength &&
      password.length <= 72;

    if (isValidPassword) {
      const encryptedPassword = await bcrypt.hash(password, 10);
      await PasswordHistory.create({ userId: this.id, password: encryptedPassword });
      this.setDataValue('password', encryptedPassword);
    } else {
      throw new InvalidParametersError(
        `Password must be ${minPasswordLength}-72 characters, containing at least 1 lowercase character, 1 uppercase character, 1 number, and 1 special character.`,
      );
    }
  }

  public async getOrCreateExternalId(): Promise<string> {
    let existingUlid = this.userUlid;
    if (!existingUlid) {
      existingUlid = (await this.update({ userUlid: ulid() })).userUlid;
    }
    return existingUlid;
  }

  public async getSessionToken(deviceId: string, deviceType: string): Promise<string> {
    return User.getSessionToken(this.id, deviceId, deviceType);
  }

  public async getSession(
    deviceId: string,
    deviceType: string,
    create: boolean = true,
  ): Promise<UserSession | null> {
    return User.getSession(this.id, deviceId, deviceType, create);
  }

  public async getMonthlyIncomeAndExpense(): Promise<{
    monthlyIncome: number;
    monthlyExpenses: number;
  }> {
    const monthlyIncomeQuery = `SELECT sum(amount) as monthlyIncome
                                from bank_transaction
                                where amount > 0
                                  and account_type = 'depository'
                                  and (account_subtype = 'checking' or
                                       account_subtype = 'prepaid' or
                                       account_subtype = 'prepaid_debit')
                                  and (transaction_date between DATE_SUB(now(), INTERVAL 30 DAY) and now())
                                  and user_id = ?`;

    const [{ monthlyIncome }] = await this.sequelize.query(monthlyIncomeQuery, {
      type: QueryTypes.SELECT,
      replacements: [this.id],
    });

    const monthlyExpensesQuery = `SELECT sum(amount) as monthlyExpenses
                                  from bank_transaction
                                  where amount < 0
                                    and account_type = 'depository'
                                    and (account_subtype = 'checking' or
                                         account_subtype = 'prepaid' or
                                         account_subtype = 'prepaid_debit')
                                    and (transaction_date between DATE_SUB(now(), INTERVAL 30 DAY) and now())
                                    and user_id = ?`;

    const [{ monthlyExpenses }] = await this.sequelize.query(monthlyExpensesQuery, {
      type: QueryTypes.SELECT,
      replacements: [this.id],
    });
    return { monthlyIncome, monthlyExpenses };
  }

  public async getSavings(): Promise<number> {
    const savingsQuery = `SELECT sum(current) as currentSavings
                          from bank_account
                          where subtype = 'savings'
                            and user_id = ?`;
    const [{ currentSavings }] = await this.sequelize.query(savingsQuery, {
      type: QueryTypes.SELECT,
      replacements: [this.id],
    });
    return currentSavings;
  }

  public get hasName(): boolean {
    return Boolean(this.firstName && this.lastName);
  }

  public async hasDaveBanking(): Promise<boolean> {
    const bankConnections = this.bankConnections || (await this.getBankConnections());
    return bankConnections.some(conn => conn.isDaveBanking());
  }

  public async getDaveBankingUUID(): Promise<string> {
    const bankConnections = this.bankConnections || (await this.getBankConnections());

    const daveBankingConn = bankConnections.find(conn => conn.isDaveBanking());
    return daveBankingConn ? daveBankingConn.externalId : null;
  }

  public hasPushNotificationsEnabled(): boolean {
    return Boolean(this.settings.push_notifications_enabled);
  }

  public hasSMSNotificationsEnabled(): boolean {
    return Boolean(this.settings.sms_notifications_enabled);
  }

  public isSoftDeleted: () => boolean = () => {
    return !moment(ACTIVE_TIMESTAMP).isSame(this.deleted);
  };

  public toJSON() {
    const record: { [key: string]: any } = this.get();

    if (record.birthdate && typeof record.birthdate.format === 'function') {
      record.birthdate = record.birthdate.format('YYYY-MM-DD');
    }

    return record;
  }

  public async canBeDeleted(): Promise<boolean> {
    const hasOutstandingAdvances = await this.hasOutstandingAdvances();
    const hasPendingPayments = await this.hasPendingPayments();
    const hasDaveBanking = await this.hasDaveBanking();
    return !hasOutstandingAdvances && !hasPendingPayments && !hasDaveBanking;
  }

  public async hasOutstandingAdvances(): Promise<boolean> {
    const advances = this.advances || (await this.getAdvances());
    return advances.some(advance => advance.outstanding > 0);
  }

  public e164PhoneNumber(): string {
    return this.phoneNumber?.split('-')[0] || '';
  }

  public async requiresPasswordUpdate(): Promise<boolean> {
    const history = this.passwordHistory || (await this.getPasswordHistory());
    return history.length === 1 && moment(this.created).isBefore(PASSWORD_UPDATE_CUTOFF_DATE);
  }

  private async hasPendingPayments(): Promise<boolean> {
    const payments = this.payments || (await this.getPayments());
    return payments.some(payment => payment.status === ExternalTransactionStatus.Pending);
  }
}
