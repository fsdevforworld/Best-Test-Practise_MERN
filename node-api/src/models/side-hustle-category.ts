import { HustleCategory as HustleCategoryNameType } from '@dave-inc/wire-typings';
import { INTEGER, STRING, TEXT } from 'sequelize';
import { Column, Model, Table, CreatedAt, UpdatedAt } from 'sequelize-typescript';
import { Moment } from 'moment';

@Table({
  tableName: 'side_hustle_category',
})
export default class SideHustleCategory extends Model<SideHustleCategory> {
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
  public name: HustleCategoryNameType;

  @Column({
    type: INTEGER,
    field: 'priority',
  })
  public priority: number;

  @Column({
    type: new TEXT('medium'),
    field: 'image',
  })
  public image: string;

  @CreatedAt
  public created: Moment;

  @UpdatedAt
  public updated: Moment;
}
