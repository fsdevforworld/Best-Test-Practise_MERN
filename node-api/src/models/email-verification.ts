import { Moment } from 'moment';
import { INTEGER, STRING, DATE, Transaction } from 'sequelize';
import {
  BelongsTo,
  Column,
  ForeignKey,
  Model,
  Table,
  CreatedAt,
  UpdatedAt,
} from 'sequelize-typescript';
import { serializeDate } from '../serialization';
import User from './user';
import { EmailVerificationResponse } from '@dave-inc/wire-typings';
import { ISerializable } from '../typings';

@Table({
  tableName: 'email_verification',
})
export default class EmailVerification extends Model<EmailVerification>
  implements ISerializable<EmailVerificationResponse> {
  public static async latestForUser(userId: number) {
    return EmailVerification.findOne({
      where: { userId },
      order: [['created', 'DESC']],
    });
  }

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

  @Column({
    type: STRING(256),
  })
  public email: string;

  @Column({
    type: DATE,
  })
  public verified: Moment;

  @CreatedAt
  public created: Date;

  @UpdatedAt
  public updated: Date;

  public serialize(): EmailVerificationResponse {
    return {
      id: this.id,
      userId: this.userId,
      email: this.email,
      verified: serializeDate(this.verified),
      created: serializeDate(this.created),
      updated: serializeDate(this.updated),
    };
  }

  public async verify(transaction: Transaction) {
    return this.update(
      {
        verified: new Date(),
      },
      { transaction },
    );
  }
}
