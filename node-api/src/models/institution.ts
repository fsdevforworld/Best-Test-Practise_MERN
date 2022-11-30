import { INTEGER, STRING, TEXT, BOOLEAN } from 'sequelize';
import { Column, Model, Table } from 'sequelize-typescript';

@Table({
  tableName: 'institution',
})
export default class Institution extends Model<Institution> {
  @Column({
    autoIncrement: true,
    primaryKey: true,
    type: INTEGER,
  })
  public id: number;

  @Column({
    type: STRING(256),
    field: 'display_name',
  })
  public displayName: string;

  @Column({
    type: STRING(256),
    field: 'plaid_institution_id',
  })
  public plaidInstitutionId: string;

  @Column({
    type: STRING(256),
    field: 'mx_institution_code',
  })
  public mxInstitutionCode: string;

  @Column({
    type: new TEXT('medium'),
  })
  public logo: string;

  @Column({
    type: STRING(256),
    field: 'account_locked',
  })
  public accountLocked: string;

  @Column({
    type: STRING(256),
    field: 'forgot_password',
  })
  public forgotPassword: string;

  @Column({
    type: STRING(32),
    field: 'primary_color',
  })
  public primaryColor: string;

  @Column({
    type: STRING(32),
    field: 'username_label',
  })
  public usernameLabel: string;

  @Column({
    type: STRING(32),
    field: 'password_label',
  })
  public passwordLabel: string;

  @Column({
    type: STRING(32),
    field: 'pin_label',
  })
  public pinLabel: string;

  @Column({
    type: BOOLEAN,
    field: 'balance_includes_pending',
  })
  public balanceIncludesPending: boolean;
}
