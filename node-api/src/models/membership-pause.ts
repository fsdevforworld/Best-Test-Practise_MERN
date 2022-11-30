import { Moment } from 'moment';
import { moment } from '@dave-inc/time-lib';
import { DATE, INTEGER } from 'sequelize';
import { ACTIVE_TIMESTAMP } from '../lib/sequelize';
import {
  BelongsTo,
  Column,
  CreatedAt,
  ForeignKey,
  Model,
  Table,
  UpdatedAt,
} from 'sequelize-typescript';
import { serializeDate } from '../serialization';
import User from './user';
import { MembershipPauseResponse } from '@dave-inc/wire-typings';
import { ISerializable } from '../typings';

@Table({
  tableName: 'membership_pause',
})
export default class MembershipPause extends Model<MembershipPause>
  implements ISerializable<MembershipPauseResponse> {
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
    field: 'paused_at',
    type: DATE,
    defaultValue: moment(),
  })
  public pausedAt: Moment;

  @Column({
    field: 'unpaused_at',
    type: DATE,
    defaultValue: moment(ACTIVE_TIMESTAMP),
  })
  public unpausedAt: Moment;

  @CreatedAt
  public created: Date;

  @UpdatedAt
  public updated: Date;

  public isActive(): boolean {
    const now = moment();
    const hasPauseStarted = this.pausedAt.isSameOrBefore(now);
    return this.hasNotEnded() && hasPauseStarted;
  }

  public hasNotEnded(): boolean {
    return this.unpausedAt.isSame(moment(ACTIVE_TIMESTAMP));
  }

  public serialize(): MembershipPauseResponse {
    return {
      id: this.id,
      userId: this.userId,
      isActive: this.isActive(),
      created: serializeDate(this.created),
      pausedAt: serializeDate(this.pausedAt),
      unpausedAt: serializeDate(this.unpausedAt),
    };
  }
}
