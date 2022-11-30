import { INTEGER, STRING } from 'sequelize';
import { Column, CreatedAt, UpdatedAt, DeletedAt, Model, Table } from 'sequelize-typescript';
import { Moment } from 'moment';

@Table({
  tableName: 'deep_link',
})
export default class DeepLink extends Model<DeepLink> {
  @Column({
    autoIncrement: true,
    primaryKey: true,
    type: INTEGER,
  })
  public id: number;

  @Column({
    type: STRING(256),
  })
  public url: string;

  @Column({
    type: STRING(256),
  })
  public path: string;

  @Column({
    type: STRING(256),
    field: `min_version`,
  })
  public minVersion: string;

  @Column({
    type: STRING(256),
    field: `max_version`,
  })
  public maxVersion: string;

  @CreatedAt
  public created: Moment;

  @UpdatedAt
  public updated: Moment;

  @DeletedAt
  public deleted: Moment;
}
