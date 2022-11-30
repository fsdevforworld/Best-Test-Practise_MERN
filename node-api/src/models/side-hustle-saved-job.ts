import { BIGINT, FindOptions, INTEGER, DATE } from 'sequelize';
import {
  Column,
  Model,
  Table,
  ForeignKey,
  BelongsTo,
  CreatedAt,
  UpdatedAt,
} from 'sequelize-typescript';
import { Moment } from 'moment';
import { User, SideHustle } from '.';

@Table({
  tableName: 'side_hustle_saved_job',
})
export default class SideHustleSavedJob extends Model<SideHustleSavedJob> {
  @Column({
    autoIncrement: true,
    primaryKey: true,
    type: BIGINT,
  })
  public id: number;

  @ForeignKey(() => User)
  @Column({
    type: INTEGER,
    field: 'user_id',
    unique: 'user_side_hustle_unique',
  })
  public userId: number;

  @BelongsTo(() => User)
  public user: User;

  public getUser: (options?: FindOptions) => PromiseLike<User>;

  @ForeignKey(() => SideHustle)
  @Column({
    type: BIGINT,
    field: 'side_hustle_id',
    unique: 'user_side_hustle_unique',
  })
  public sideHustleId: number;

  @BelongsTo(() => SideHustle)
  public sideHustle: SideHustle;

  public getSideHustle: (options?: FindOptions) => PromiseLike<SideHustle>;

  @Column({
    type: DATE,
    field: 'applied',
  })
  public applied: Moment;

  @CreatedAt
  public created: Moment;

  @UpdatedAt
  public updated: Moment;
}
