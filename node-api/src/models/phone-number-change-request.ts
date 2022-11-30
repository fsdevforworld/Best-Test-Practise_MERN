import { Moment } from 'moment';
import { INTEGER, STRING, DATE } from 'sequelize';
import {
  BelongsTo,
  Column,
  CreatedAt,
  ForeignKey,
  Model,
  Table,
  UpdatedAt,
} from 'sequelize-typescript';
import User from './user';

@Table({
  tableName: 'phone_number_change_request',
})
export default class PhoneNumberChangeRequest extends Model<PhoneNumberChangeRequest> {
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
    type: STRING(512),
    field: 'old_phone_number',
  })
  public oldPhoneNumber: string;

  @Column({
    type: STRING(256),
    field: 'verification_code',
  })
  public verificationCode: string;

  @Column({
    type: STRING(512),
    field: 'new_phone_number',
  })
  public newPhoneNumber: string;

  @Column({
    type: DATE,
    field: 'verified',
  })
  public verified: Moment;

  @CreatedAt
  public created: Moment;

  @UpdatedAt
  public updated: Moment;
}
