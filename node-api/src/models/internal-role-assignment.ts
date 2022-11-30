import { INTEGER, DATE } from 'sequelize';
import { Column, CreatedAt, Model, Table, UpdatedAt, DeletedAt } from 'sequelize-typescript';
import { Moment, moment } from '@dave-inc/time-lib';
import { ACTIVE_TIMESTAMP } from '../lib/sequelize';

@Table({
  tableName: 'internal_role_assignment',
  paranoid: true,
})
export default class InternalRoleAssignment extends Model<InternalRoleAssignment> {
  @Column({
    autoIncrement: true,
    primaryKey: true,
    type: INTEGER,
  })
  public id: number;

  @Column({
    type: INTEGER,
    field: 'internal_user_id',
  })
  public internalUserId: number;

  @Column({
    type: INTEGER,
    field: 'internal_role_id',
  })
  public internalRoleId: number;

  @CreatedAt
  public created: Moment;

  @UpdatedAt
  public updated: Moment;

  @DeletedAt
  @Column({
    defaultValue: moment(ACTIVE_TIMESTAMP),
    type: DATE,
  })
  public deleted: Moment;
}
