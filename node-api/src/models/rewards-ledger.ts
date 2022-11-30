import { INTEGER, DECIMAL } from 'sequelize';
import {
  BelongsTo,
  Column,
  ForeignKey,
  Model,
  Table,
  CreatedAt,
  UpdatedAt,
} from 'sequelize-typescript';

import User from './user';
import EmpyrEvent from './empyr-event';

@Table({
  tableName: 'rewards_ledger',
})
export default class RewardsLedger extends Model<RewardsLedger> {
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

  @BelongsTo(() => EmpyrEvent)
  public empyrEvent: EmpyrEvent;

  @ForeignKey(() => EmpyrEvent)
  @Column({
    field: 'empyr_event_id',
    type: INTEGER,
  })
  public empyrEventId: number;

  @BelongsTo(() => User)
  public user: User;

  @Column({
    type: DECIMAL(16, 2),
    field: 'amount',
  })
  public amount: number;

  @CreatedAt
  public created: Date;

  @UpdatedAt
  public updated: Date;
}
