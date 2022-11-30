import { BOOLEAN, INTEGER } from 'sequelize';
import {
  BelongsTo,
  CreatedAt,
  Column,
  ForeignKey,
  Table,
  UpdatedAt,
  Model,
} from 'sequelize-typescript';
import { ISerializable } from '../typings';
import BankAccount from './bank-account';
import BankConnection from './bank-connection';
import { BankConnectionTransitionResponse } from '@dave-inc/wire-typings';

@Table({
  tableName: 'bank_connection_transition',
})
export default class BankConnectionTransition extends Model<BankConnectionTransition>
  implements ISerializable<BankConnectionTransitionResponse> {
  public static getByToBankAccountId(
    bankAccountId: number,
  ): PromiseLike<BankConnectionTransition[]> {
    return BankConnectionTransition.findAll({
      include: [
        {
          as: BankConnectionTransition.associations.toBankConnection.as,
          include: [
            {
              model: BankAccount,
              where: { id: bankAccountId },
            },
          ],
          model: BankConnection,
          required: true,
        },
      ],
    });
  }

  public static async findOrCreateFromToBankConnection(
    fromDefaultBankAccountId: number,
    toBankConnection: BankConnection,
  ): Promise<BankConnectionTransition> {
    const fromBankAccount = await BankAccount.findByPk(fromDefaultBankAccountId);

    if (!fromBankAccount) {
      return;
    }

    const [bankConnectionTransition] = await BankConnectionTransition.findOrCreate({
      where: {
        fromBankConnectionId: fromBankAccount.bankConnectionId,
        toBankConnectionId: toBankConnection.id,
      },
      defaults: {
        fromDefaultBankAccountId,
      },
    });

    return bankConnectionTransition;
  }

  public static async getTransitionedToBankAccounts(fromDefaultBankAccountId: number) {
    const transition = await BankConnectionTransition.findOne({
      where: {
        fromDefaultBankAccountId,
      },
      include: [
        {
          model: BankConnection,
          as: 'toBankConnection',
          include: [BankAccount],
        },
      ],
    });

    if (!transition || !transition.toBankConnection) {
      return [];
    }

    return transition.toBankConnection.bankAccounts;
  }

  @Column({
    autoIncrement: true,
    primaryKey: true,
    type: INTEGER,
  })
  public id: number;

  @ForeignKey(() => BankConnection)
  @Column({
    field: 'from_bank_connection_id',
    type: INTEGER,
  })
  public fromBankConnectionId: number;

  @BelongsTo(() => BankConnection, 'fromBankConnectionId')
  public fromBankConnection: BankConnection;

  @ForeignKey(() => BankConnection)
  @Column({
    field: 'to_bank_connection_id',
    type: INTEGER,
  })
  public toBankConnectionId: number;

  @BelongsTo(() => BankConnection, 'toBankConnectionId')
  public toBankConnection: BankConnection;

  @ForeignKey(() => BankAccount)
  @Column({
    field: 'from_default_bank_account_id',
    type: INTEGER,
  })
  public fromDefaultBankAccountId: number;

  @BelongsTo(() => BankAccount)
  public fromDefaultBankAccount: BankAccount;
  public getFromDefaultBankAccount: () => Promise<BankAccount>;

  @Column({
    defaultValue: false,
    field: 'has_activated_physical_card',
    type: BOOLEAN,
  })
  public hasActivatedPhysicalCard: boolean;

  @Column({
    defaultValue: false,
    field: 'has_received_first_paycheck',
    type: BOOLEAN,
  })
  public hasReceivedFirstPaycheck: boolean;

  @Column({
    defaultValue: false,
    field: 'has_received_recurring_paycheck',
    type: BOOLEAN,
  })
  public hasReceivedRecurringPaycheck: boolean;

  @CreatedAt
  public created: Date;

  @UpdatedAt
  public updated: Date;

  public serialize(): BankConnectionTransitionResponse {
    return {
      id: this.id,
      fromBankConnectionId: this.fromBankConnectionId,
      fromDefaultBankAccountId: this.fromDefaultBankAccountId,
      toBankConnectionId: this.toBankConnectionId,
    };
  }
}
