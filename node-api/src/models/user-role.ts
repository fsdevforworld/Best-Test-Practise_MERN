import { BelongsToGetAssociationMixin, INTEGER } from 'sequelize';
import {
  BelongsTo,
  Column,
  CreatedAt,
  DeletedAt,
  ForeignKey,
  Model,
  Table,
} from 'sequelize-typescript';
import { Moment } from '@dave-inc/time-lib';
import Role from './role';

@Table({
  tableName: 'user_role',
  updatedAt: false,
})
export default class UserRole extends Model<UserRole> {
  @Column({
    autoIncrement: true,
    primaryKey: true,
    type: INTEGER,
  })
  public id: number;

  @Column({
    type: INTEGER,
    field: 'user_id',
  })
  public userId: number;

  @ForeignKey(() => Role)
  @Column({
    type: INTEGER,
    field: 'role_id',
  })
  public roleId: number;

  @BelongsTo(() => Role)
  public role: Role;
  public getRole: BelongsToGetAssociationMixin<Role>;

  @CreatedAt
  public created: Moment;

  @DeletedAt
  public deleted: Moment;
}
