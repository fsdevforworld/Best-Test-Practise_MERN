import { Moment } from '@dave-inc/time-lib';
import { BelongsToGetAssociationMixin, DATE, ENUM, INTEGER, STRING } from 'sequelize';
import {
  Column,
  Model,
  Table,
  CreatedAt,
  ForeignKey,
  BelongsTo,
  UpdatedAt,
} from 'sequelize-typescript';

import BankConnection from './bank-connection';

const statuses = ['CREATED', 'REQUESTED', 'RECEIVED', 'PROCESSING', 'COMPLETED', 'ERROR'] as const;

@Table({
  tableName: 'bank_connection_refresh',
})
class BankConnectionRefresh extends Model<BankConnectionRefresh> {
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
  public getBankConnection: BelongsToGetAssociationMixin<BankConnection>;

  @Column({
    type: ENUM(...statuses),
    field: 'status',
  })
  public status: typeof statuses[number];

  @CreatedAt
  public created: Moment;

  @UpdatedAt
  public updated: Moment;

  @Column({
    type: DATE,
    field: 'requested_at',
  })
  public requestedAt: Moment;

  @Column({
    type: DATE,
    field: 'received_at',
  })
  public receivedAt: Moment;

  @Column({
    type: DATE,
    field: 'processing_at',
  })
  public processingAt: Moment;

  @Column({
    type: DATE,
    field: 'completed_at',
  })
  public completedAt: Moment;

  @Column({
    type: DATE,
    field: 'error_at',
  })
  public errorAt: Moment;

  @Column({
    type: STRING(256),
    field: 'error_code',
  })
  public errorCode: string;
}

export default BankConnectionRefresh;
