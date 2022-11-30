import { Moment } from 'moment';
import { STRING, INTEGER, ENUM, TEXT, DATEONLY } from 'sequelize';
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
  paranoid: false,
  tableName: 'ccpa_request',
  updatedAt: false,
})
export default class CCPARequest extends Model<CCPARequest> {
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
    type: ENUM(
      'RECEIVED',
      'INFORMATION_COLLECTION',
      'INFORMATION_MISMATCH',
      'INFORMATION_SENT',
      'COMPLETED',
    ),
    field: 'status',
  })
  public status:
    | 'RECEIVED'
    | 'INFORMATION_COLLECTION'
    | 'INFORMATION_MISMATCH'
    | 'INFORMATION_SENT'
    | 'COMPLETED';

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
    type: STRING(256),
  })
  public email: string;

  @Column({
    type: STRING(256),
  })
  public ssn: string;

  @Column({
    type: DATEONLY,
  })
  public birthdate: Moment;

  @Column({
    type: ENUM('REQUEST', 'DELETION'),
    field: 'request_type',
  })
  public requestType: 'REQUEST' | 'DELETION';

  @Column({
    type: TEXT,
  })
  public details: string;

  @CreatedAt
  public created: Moment;

  @UpdatedAt
  public updated: Moment;
}
