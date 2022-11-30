import { Moment } from '@dave-inc/time-lib';
import { INTEGER, STRING, BOOLEAN, BelongsToGetAssociationMixin } from 'sequelize';
import {
  BelongsTo,
  Column,
  CreatedAt,
  DeletedAt,
  ForeignKey,
  Model,
  Scopes,
  Table,
} from 'sequelize-typescript';
import { NotePriorityCode } from '../services/internal-dashboard-api/domain/note';

import DashboardNotePriority from './dashboard-note-priority';
import InternalUser from './internal-user';
import User from './user';

@Scopes(() => ({
  withRelated: {
    include: [
      {
        model: InternalUser,
      },
    ],
  },
}))
@Table({
  deletedAt: 'deleted',
  paranoid: true,
  tableName: 'admin_comment',
  updatedAt: false,
})
export default class AdminComment extends Model<AdminComment> {
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

  @BelongsTo(() => User, 'user_id')
  public user: User;

  @ForeignKey(() => User)
  @Column({
    field: 'author_id',
    type: INTEGER,
  })
  public authorId: number;

  @BelongsTo(() => InternalUser, 'author_id')
  public author: InternalUser;
  public getAuthor: BelongsToGetAssociationMixin<InternalUser>;

  @Column({
    type: STRING(5000),
  })
  public message: string;

  @Column({
    type: BOOLEAN,
    field: 'is_high_priority',
    defaultValue: false,
  })
  public isHighPriority: boolean;

  @CreatedAt
  public created: Moment;

  @DeletedAt
  public deleted: Moment;

  public getDashboardNotePriority() {
    return DashboardNotePriority.findOne({
      where: {
        code: this.getDashboardNotePriorityCode(),
      },
    });
  }

  public getDashboardNotePriorityCode() {
    return this.isHighPriority ? NotePriorityCode.High : NotePriorityCode.Default;
  }
}
