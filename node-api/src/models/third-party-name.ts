import {
  BelongsTo,
  Column,
  Model,
  Table,
  CreatedAt,
  UpdatedAt,
  ForeignKey,
} from 'sequelize-typescript';
import { Moment } from 'moment';
import User from './user';

@Table({ tableName: 'third_party_name' })
export default class ThirdPartyName extends Model<ThirdPartyName> {
  @Column({ field: 'first_name' })
  public firstName: string;

  @Column({ field: 'last_name' })
  public lastName: string;

  @ForeignKey(() => User)
  @Column({ field: 'user_id' })
  public userId: number;

  @BelongsTo(() => User)
  public user: User;

  @CreatedAt
  public created: Moment;

  @UpdatedAt
  public updated: Moment;

  public get isValid() {
    if (this.firstName && this.lastName) {
      return true;
    } else {
      return false;
    }
  }

  public get isInvalid() {
    return !this.isValid;
  }
}
