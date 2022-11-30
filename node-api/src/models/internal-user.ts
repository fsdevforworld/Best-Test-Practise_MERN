import {
  DATE,
  INTEGER,
  STRING,
  HasManyGetAssociationsMixin,
  HasManyAddAssociationMixin,
  HasManyHasAssociationMixin,
  HasManySetAssociationsMixin,
} from 'sequelize';
import {
  Column,
  CreatedAt,
  Model,
  Table,
  UpdatedAt,
  BelongsToMany,
  DeletedAt,
} from 'sequelize-typescript';
import { Moment, moment } from '@dave-inc/time-lib';
import { ACTIVE_TIMESTAMP } from '../lib/sequelize';
import InternalRole, { InternalRoleName } from './internal-role';
import InternalRoleAssignment from './internal-role-assignment';

@Table({
  tableName: 'internal_user',
  paranoid: true,
})
export default class InternalUser extends Model<InternalUser> {
  @Column({
    autoIncrement: true,
    primaryKey: true,
    type: INTEGER,
  })
  public id: number;

  @Column({
    type: STRING(256),
  })
  public email: string;

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

  @BelongsToMany(
    () => InternalRole,
    () => InternalRoleAssignment,
    'internal_user_id',
    'internal_role_id',
  )
  public internalRoles: InternalRole[];
  public getInternalRoles: HasManyGetAssociationsMixin<InternalRole>;
  public hasInternalRoles: HasManyHasAssociationMixin<InternalRole, number>;
  public setInternalRoles: HasManySetAssociationsMixin<InternalRole, number>;
  public addInternalRole: HasManyAddAssociationMixin<InternalRole, number>;

  public async getInternalRoleNames(): Promise<InternalRoleName[]> {
    const roles = this.internalRoles || (await this.getInternalRoles());
    return roles.map(role => role.name);
  }
}
