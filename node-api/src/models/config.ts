import { STRING, INTEGER, DATE, JSON as SQLJSON } from 'sequelize';
import { Column, Model, Table } from 'sequelize-typescript';
import { Moment } from 'moment';

@Table({
  tableName: 'config',
  updatedAt: false,
})
export default class Config extends Model<Config> {
  @Column({
    autoIncrement: true,
    primaryKey: true,
    type: INTEGER,
  })
  public id: number;

  @Column({
    type: STRING(255),
  })
  public key: string;

  @Column({
    type: SQLJSON,
  })
  public value: any;

  @Column({
    type: DATE,
  })
  public created: Moment;

  @Column({
    type: DATE,
  })
  public updated: Moment;
}
