import { INTEGER, TEXT, UUIDV4 } from 'sequelize';
import { BelongsTo, Column, ForeignKey, Model, Table } from 'sequelize-typescript';
import User from './user';

@Table({
  tableName: 'banking_direct_user_session',
  updatedAt: false,
})
export default class BankingDirectUserSession extends Model<BankingDirectUserSession> {
  @Column({
    autoIncrement: true,
    primaryKey: true,
    type: INTEGER,
  })
  public id: number;

  @Column({
    type: new TEXT('tiny'),
    field: 'token',
    defaultValue: UUIDV4,
  })
  public token: string;

  @ForeignKey(() => User)
  @Column({
    field: 'user_id',
    type: INTEGER,
  })
  public userId: number;

  @BelongsTo(() => User)
  public user: User;
}
