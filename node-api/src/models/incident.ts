import { Moment } from 'moment';
import { INTEGER, STRING, TEXT, DATE, BOOLEAN } from 'sequelize';
import {
  BelongsTo,
  BelongsToMany,
  CreatedAt,
  Column,
  DeletedAt,
  ForeignKey,
  Model,
  Table,
  UpdatedAt,
  Scopes,
} from 'sequelize-typescript';

import User from './user';
import InternalUser from './internal-user';
import UserIncident from './user-incident';

@Scopes({
  active: {
    where: { resolvedAt: null, deleted: null },
  },
  private: {
    where: { isPublic: false },
  },
  public: {
    where: { isPublic: true },
  },
})
@Table({
  tableName: 'incident',
  paranoid: true,
})
export default class Incident extends Model<Incident> {
  @Column({
    type: INTEGER,
    primaryKey: true,
    autoIncrement: true,
  })
  public id: number;

  @Column({
    type: STRING,
  })
  public title: string;

  @Column({
    type: TEXT,
  })
  public description: string;

  @ForeignKey(() => InternalUser)
  @Column({
    field: 'creator_id',
    type: INTEGER,
  })
  public creatorId: number;

  @BelongsTo(() => InternalUser, 'creator_id')
  public creator: InternalUser;

  @ForeignKey(() => InternalUser)
  @Column({
    field: 'resolver_id',
    type: INTEGER,
  })
  public resolverId: number;

  @BelongsTo(() => InternalUser, 'resolver_id')
  public resolver: InternalUser;

  @Column({
    type: DATE,
    field: 'resolved_at',
  })
  public resolvedAt: string;

  @Column({
    type: BOOLEAN,
    field: 'is_public',
  })
  public isPublic: boolean;

  @DeletedAt
  public deleted: Moment;

  @CreatedAt
  public created: Moment;

  @UpdatedAt
  public updated: Moment;

  @BelongsToMany(
    () => User,
    () => UserIncident,
  )
  public users: User[];
}
