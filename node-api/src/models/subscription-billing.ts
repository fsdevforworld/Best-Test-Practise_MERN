import {
  ExternalTransactionStatus,
  SubscriptionBillingResponse,
  SubscriptionBillingPaymentStatusResponse,
} from '@dave-inc/wire-typings';
import { map } from 'lodash';
import { Moment } from 'moment';
import { DATE, DATEONLY, DECIMAL, INTEGER, Op, STRING } from 'sequelize';
import {
  BelongsTo,
  BelongsToMany,
  Column,
  CreatedAt,
  ForeignKey,
  Model,
  Scopes,
  Table,
  UpdatedAt,
} from 'sequelize-typescript';
import { serializeDate } from '../serialization';
import User from './user';
import SubscriptionPaymentLineItem from './subscription-payment-line-item';
import SubscriptionPayment from './subscription-payment';
import RewardsLedger from './rewards-ledger';
import { ISerializable } from '../typings';

/**
 * Only supports a single payment per billing currently.
 */
function getSubscriptionBillingPaymentStatus(
  subscriptionBilling?: SubscriptionBilling,
): SubscriptionBillingPaymentStatusResponse {
  const output: SubscriptionBillingPaymentStatusResponse = {
    amount: 0,
    status: null,
    date: null,
  };
  const subscriptionPayments = subscriptionBilling.subscriptionPayments; // Already sorted.
  if (subscriptionPayments?.length) {
    const lastPayment = subscriptionPayments[subscriptionPayments.length - 1];
    output.amount = lastPayment.amount;
    output.date = serializeDate(lastPayment.created, 'YYYY-MM-DD');
    output.status = lastPayment.status;
  }
  return output;
}

@Scopes({
  unpaid: {
    include: [
      {
        model: () => SubscriptionPayment,
        required: false,
        where: {
          status: {
            [Op.in]: [
              ExternalTransactionStatus.Completed,
              ExternalTransactionStatus.Pending,
              ExternalTransactionStatus.Unknown,
              ExternalTransactionStatus.Chargeback,
            ],
          },
        },
      },
    ],
    where: {
      '$subscriptionPayments.id$': null, // https://github.com/sequelize/sequelize/issues/3936#issuecomment-159192919
      amount: { [Op.gt]: 0 },
    },
  },
})
@Table({
  tableName: 'subscription_billing',
})
export default class SubscriptionBilling extends Model<SubscriptionBilling>
  implements ISerializable<SubscriptionBillingResponse> {
  @BelongsToMany(
    () => SubscriptionPayment,
    () => SubscriptionPaymentLineItem,
  )
  public subscriptionPayments: SubscriptionPayment[];

  public addSubscriptionPayment: (subscriptionPayment: SubscriptionPayment) => void;

  public getSubscriptionPayments: () => Promise<SubscriptionPayment[]>;

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

  @Column({
    field: 'amount',
    type: DECIMAL(16, 2),
  })
  public amount: number;

  @Column({
    field: 'start',
    type: DATE,
  })
  public start: Moment;

  @Column({
    field: 'end',
    type: DATE,
  })
  public end: Moment;

  @Column({
    field: 'billing_cycle',
    type: STRING(256),
  })
  public billingCycle: string;

  @Column({
    type: DATEONLY,
    field: 'due_date',
  })
  public dueDate: Moment;

  @ForeignKey(() => RewardsLedger)
  @Column({
    field: 'rewards_ledger_id',
    type: INTEGER,
  })
  public rewardsLedgerId: number;

  @BelongsTo(() => RewardsLedger)
  public rewardsLedger: RewardsLedger;

  @ForeignKey(() => User)
  @Column({
    field: 'referred_user_id',
    type: INTEGER,
  })
  public referredUserId: number;

  @CreatedAt
  public created: Moment;

  @UpdatedAt
  public updated: Moment;

  public async isPaid() {
    const payments = await this.getSubscriptionPayments();

    return payments.some(payment => payment.isPaid());
  }

  public isFree() {
    return this.amount === 0;
  }

  public async isAwaitingPayment() {
    return !(this.isFree() || (await this.isPaid()));
  }

  public serialize(): SubscriptionBillingResponse {
    return {
      id: this.id,
      amount: this.amount,
      billingCycle: this.billingCycle,
      created: serializeDate(this.created),
      dueDate: serializeDate(this.dueDate, 'YYYY-MM-DD'),
      updated: serializeDate(this.updated),
      paymentStatus: getSubscriptionBillingPaymentStatus(this),
      subscriptionPayments: map(this.subscriptionPayments, subscriptionPayment => {
        const {
          amount,
          bankAccountId,
          created,
          status,
          paymentMethod,
          bankAccount,
        } = subscriptionPayment;
        let paymentDisplayName;
        if (paymentMethod?.displayName) {
          paymentDisplayName = paymentMethod.displayName;
        } else if (bankAccount?.institution?.displayName && bankAccount?.lastFour) {
          paymentDisplayName = `${bankAccount.institution.displayName}: ${bankAccount.lastFour}`;
        }

        return {
          amount,
          bankAccountId,
          created: serializeDate(created, 'YYYY-MM-DD'),
          status,
          paymentDisplayName,
          paymentMethod: paymentMethod
            ? {
                id: paymentMethod.id,
                displayName: paymentMethod.displayName,
                scheme: paymentMethod.scheme,
                mask: paymentMethod.mask,
                expiration: serializeDate(paymentMethod.expiration, 'YYYY-MM'),
              }
            : null,
        };
      }),
      paidByRewardsDate: this.rewardsLedger
        ? serializeDate(this.rewardsLedger.created, 'YYYY-MM-DD')
        : null,
    };
  }
}
