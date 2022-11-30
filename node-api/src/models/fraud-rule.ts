import { Moment } from 'moment';
import { INTEGER, STRING, DATEONLY } from 'sequelize';
import {
  BelongsTo,
  Column,
  CreatedAt,
  UpdatedAt,
  ForeignKey,
  Model,
  Table,
} from 'sequelize-typescript';

import InternalUser from './internal-user';

@Table({
  tableName: 'fraud_rule',
})
export default class FraudRule extends Model<FraudRule> {
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

  @ForeignKey(() => InternalUser)
  @Column({
    field: 'created_by_user_id',
    type: INTEGER,
  })
  public createdByUserId: number;

  @BelongsTo(() => InternalUser, 'created_by_user_id')
  public createdByUser: InternalUser;

  @ForeignKey(() => InternalUser)
  @Column({
    field: 'updated_by_user_id',
    type: INTEGER,
  })
  public updatedByUserId: number;

  @BelongsTo(() => InternalUser, 'updated_by_user_id')
  public updatedByUser: InternalUser;

  @Column({
    type: STRING,
  })
  public email: string;

  @Column({
    type: STRING,
    field: 'phone_number',
  })
  public phoneNumber: string;

  @Column({
    type: STRING,
    field: 'first_name',
  })
  public firstName: string;

  @Column({
    type: STRING,
    field: 'last_name',
  })
  public lastName: string;

  @Column({
    type: STRING,
    field: 'address_line_1',
  })
  public addressLine1: string;

  @Column({
    type: STRING,
    field: 'address_line_2',
  })
  public addressLine2: string;

  @Column({
    type: STRING,
    field: 'city',
  })
  public city: string;

  @Column({
    type: STRING,
    field: 'state',
  })
  public state: string;

  @Column({
    type: STRING,
    field: 'zip_code',
  })
  public zipCode: string;

  @Column({
    type: DATEONLY,
  })
  public birthdate: Moment;

  @Column({
    type: STRING,
    field: 'is_active',
  })
  public isActive: boolean;
}
