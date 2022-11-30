import { Moment } from 'moment';
import { INTEGER, JSON as SQLJSON, DATE, TEXT } from 'sequelize';
import {
  BelongsTo,
  Column,
  CreatedAt,
  UpdatedAt,
  ForeignKey,
  Model,
  Table,
} from 'sequelize-typescript';

import User from './user';

@Table({
  tableName: 'dave_banking_call_session',
})
export default class DaveBankingCallSession extends Model<DaveBankingCallSession> {
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

  @ForeignKey(() => User)
  @Column({
    field: 'agent_id',
    type: INTEGER,
  })
  public agentId: number;

  @BelongsTo(() => User, 'agentId')
  public agent: User;

  @ForeignKey(() => User)
  @Column({
    field: 'customer_id',
    type: INTEGER,
  })
  public customerId: number;

  @BelongsTo(() => User, 'customerId')
  public customer: User;

  @Column({
    field: 'start_at',
    type: DATE,
  })
  public startAt: Moment;

  @Column({
    field: 'end_at',
    type: DATE,
  })
  public endAt: Moment;

  @Column({
    type: INTEGER,
    field: 'zendesk_ticket_id',
  })
  public zendeskTicketId: number;

  @Column({
    type: TEXT,
  })
  public notes: string;

  @Column({
    type: SQLJSON,
    field: 'call_reasons',
  })
  public callReasons: any;

  @Column({
    type: SQLJSON,
    field: 'verified_parameters',
  })
  public verifiedParameters: any;
}
