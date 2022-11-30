import { Moment } from 'moment';
import { DATE, STRING, INTEGER, TEXT, BelongsToGetAssociationMixin } from 'sequelize';
import { BelongsTo, Column, ForeignKey, Model, Table } from 'sequelize-typescript';

import User from './user';

@Table({
  tableName: 'delete_request',
  updatedAt: false,
})
export default class DeleteRequest extends Model<DeleteRequest> {
  @Column({
    autoIncrement: true,
    primaryKey: true,
    type: INTEGER,
  })
  public id: number;

  @ForeignKey(() => User)
  @Column({
    field: 'user_id',
    type: INTEGER,
  })
  public userId: number;

  @BelongsTo(() => User)
  public user: User;
  public getUser: BelongsToGetAssociationMixin<User>;

  @Column({
    type: STRING(255),
  })
  public reason: string;

  @Column({
    field: 'additional_info',
    type: TEXT,
  })
  public additionalInfo: string;

  @Column({
    type: DATE,
  })
  public created: Moment;
}
