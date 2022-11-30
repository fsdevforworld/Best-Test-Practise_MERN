import { INTEGER } from 'sequelize';
import { BelongsTo, Column, ForeignKey, Model, Table } from 'sequelize-typescript';

import InternalUser from './internal-user';
import User from './user';

@Table({
  tableName: 'support_user_view',
  updatedAt: false,
})
export default class SupportUserView extends Model<SupportUserView> {
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

  @ForeignKey(() => InternalUser)
  @Column({
    field: 'viewer_id',
    type: INTEGER,
  })
  public viewerId: number;

  @BelongsTo(() => InternalUser, 'viewer_id')
  public viewer: InternalUser;
}
