import { UserRole } from '@dave-inc/wire-typings';
import { INTEGER, STRING } from 'sequelize';
import { Column, CreatedAt, UpdatedAt, DeletedAt, Model, Table } from 'sequelize-typescript';
import { Moment } from '@dave-inc/time-lib';

@Table({
  tableName: 'role',
  paranoid: true,
})
export default class Role extends Model<Role> {
  @Column({
    autoIncrement: true,
    primaryKey: true,
    type: INTEGER,
  })
  public id: number;

  @Column({
    type: STRING(256),
  })
  public name: UserRole;

  @CreatedAt
  public created: Moment;

  @UpdatedAt
  public updated: Moment;

  @DeletedAt
  public deleted: Moment;
}
