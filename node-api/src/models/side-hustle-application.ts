import { BOOLEAN, DATE, ENUM, INTEGER, JSON as SQLJSON } from 'sequelize';
import {
  Column,
  CreatedAt,
  DeletedAt,
  Model,
  Table,
  UpdatedAt,
  ForeignKey,
  BelongsTo,
} from 'sequelize-typescript';
import { Moment } from 'moment';
import { serializeDate } from '../serialization';
import User from './user';
import InternalUser from './internal-user';
import SideHustleJob from './side-hustle-job';
import { ISerializable } from '../typings';
import { SideHustleApplicationResponse } from '@dave-inc/wire-typings';

export enum Email {
  Primary = 'PRIMARY',
  Secondary = 'SECONDARY',
}

export enum Status {
  REQUESTED = 'REQUESTED',
  CONTACTED = 'CONTACTED',
  OPENED = 'OPENED',
  CLICKED = 'CLICKED',
}

@Table({
  tableName: 'side_hustle_applications',
})
export default class SideHustleApplication extends Model<SideHustleApplication>
  implements ISerializable<SideHustleApplicationResponse> {
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

  @ForeignKey(() => SideHustleJob)
  @Column({
    type: INTEGER,
    field: 'side_hustle_job_id',
  })
  public sideHustleJobId: number;

  @BelongsTo(() => SideHustleJob)
  public sideHustleJob: SideHustleJob;

  @Column({
    type: ENUM('PRIMARY', 'SECONDARY'),
    field: 'email',
  })
  public email: Email;

  @CreatedAt
  public created: Date;
  @UpdatedAt
  public updated: Date;
  @DeletedAt
  public deleted: Moment;

  @Column({
    type: SQLJSON,
  })
  public blockers: any;

  @Column({
    type: BOOLEAN,
  })
  public successful: boolean;

  @ForeignKey(() => InternalUser)
  @Column({
    field: 'admin_id',
    type: INTEGER,
  })
  public adminId: number;

  @BelongsTo(() => InternalUser)
  public admin: InternalUser;

  @Column({
    type: ENUM('REQUESTED', 'CONTACTED', 'OPENED', 'CLICKED'),
    field: 'status',
  })
  public status: Status;

  @Column({
    type: DATE,
  })
  public requested: Moment;

  public serialize(): SideHustleApplicationResponse {
    return {
      id: this.id,
      sideHustleJobId: this.sideHustleJobId,
      name: this.sideHustleJob.name,
      status: this.status,
      requested: serializeDate(this.requested),
      created: serializeDate(this.created),
      updated: serializeDate(this.updated),
    };
  }
}
