import { HustlePartner } from '@dave-inc/wire-typings';
import { INTEGER, STRING, BOOLEAN } from 'sequelize';
import { Column, Model, Table, CreatedAt, UpdatedAt } from 'sequelize-typescript';
import { Moment } from 'moment';

@Table({
  tableName: 'side_hustle_provider',
})
export default class SideHustleProvider extends Model<SideHustleProvider> {
  @Column({
    autoIncrement: true,
    primaryKey: true,
    type: INTEGER,
  })
  public id: number;

  @Column({
    type: STRING(256),
    field: 'name',
  })
  public name: HustlePartner;

  @Column({
    type: BOOLEAN,
    field: 'dave_authority',
  })
  public isDaveAuthority: boolean;

  @CreatedAt
  public created: Moment;

  @UpdatedAt
  public updated: Moment;
}
