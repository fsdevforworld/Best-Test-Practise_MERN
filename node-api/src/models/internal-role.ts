import {
  INTEGER,
  STRING,
  DATE,
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
  DeletedAt,
  BelongsToMany,
} from 'sequelize-typescript';
import { Moment } from '@dave-inc/time-lib';
import InternalUser from './internal-user';
import InternalRoleAssignment from './internal-role-assignment';

export type InternalRoleName =
  | 'bankAdmin'
  | 'overdraftAdmin'
  | 'bankAdmin'
  | 'bankLead'
  | 'bankManager'
  | 'bankSupport'
  | 'bulkUpdateAdmin'
  | 'overdraftAdmin'
  | 'overdraftLead'
  | 'overdraftManager'
  | 'overdraftSupport'
  | 'bulkUpdateAdmin';

export const ALL_ADMIN_INTERNAL_ROLES: InternalRoleName[] = [
  'bankAdmin',
  'bulkUpdateAdmin',
  'overdraftAdmin',
];
export const ALL_CUSTOMER_SUPPORT_INTERNAL_ROLES: InternalRoleName[] = [
  'bankAdmin',
  'bankLead',
  'bankManager',
  'bankSupport',
  'overdraftAdmin',
  'overdraftLead',
  'overdraftManager',
  'overdraftSupport',
  'bulkUpdateAdmin',
];

@Table({
  tableName: 'internal_role',
  paranoid: true,
})
export default class InternalRole extends Model<InternalRole> {
  @Column({
    autoIncrement: true,
    primaryKey: true,
    type: INTEGER,
  })
  public id: number;

  @Column({
    type: STRING(256),
  })
  public name: InternalRoleName;

  @Column({
    type: DATE,
    field: 'last_sync',
  })
  public lastSync: Moment;

  @BelongsToMany(
    () => InternalUser,
    () => InternalRoleAssignment,
    'internal_role_id',
    'internal_user_id',
  )
  public internalUsers: InternalUser[];
  public getInternalUsers: HasManyGetAssociationsMixin<InternalUser>;
  public hasInternalUsers: HasManyHasAssociationMixin<InternalUser, number>;
  public setInternalUsers: HasManySetAssociationsMixin<InternalUser, number>;
  public addInternalUser: HasManyAddAssociationMixin<InternalUser, number>;

  @CreatedAt
  public created: Moment;

  @UpdatedAt
  public updated: Moment;

  @DeletedAt
  public deleted: Moment;
}
